"""SQLite persistence for documents and their text chunks.

One small file-backed database replaces the previous MongoDB + ChromaDB pair.
Embeddings are stored as raw float32 blobs next to the chunk text; for a
personal library (hundreds to a few thousand chunks) brute-force cosine search
in numpy is effectively instant, so no separate vector database is needed.

Each call opens its own short-lived connection, which keeps the module safe to
use from FastAPI's worker threads and the background indexing executor.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id            TEXT PRIMARY KEY,          -- sha256 prefix of the file bytes
    filename      TEXT NOT NULL,             -- original name, for display only
    title         TEXT,
    page_count    INTEGER,
    size_bytes    INTEGER NOT NULL,
    status        TEXT NOT NULL,             -- processing | ready | failed
    search_mode   TEXT,                      -- semantic | keyword (once ready)
    error         TEXT,
    outline       TEXT NOT NULL DEFAULT '[]',-- JSON list of {level, title, page}
    uploaded_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id              TEXT PRIMARY KEY,        -- "<document_id>:<index>"
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    idx             INTEGER NOT NULL,
    section         TEXT,
    text            TEXT NOT NULL,
    page            INTEGER NOT NULL,        -- 1-based page of the first block
    rects           TEXT NOT NULL,           -- JSON list of {page, x0, y0, x1, y1} (0-1 fractions)
    embedding       BLOB,
    embedding_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
"""


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass(slots=True)
class DocumentRow:
    id: str
    filename: str
    title: str | None
    page_count: int | None
    size_bytes: int
    status: str
    search_mode: str | None
    error: str | None
    outline: list[dict]
    uploaded_at: str


@dataclass(slots=True)
class ChunkRow:
    id: str
    document_id: str
    idx: int
    section: str | None
    text: str
    page: int
    rects: list[dict]
    embedding: np.ndarray | None = None
    embedding_model: str | None = None


@dataclass(slots=True)
class NewChunk:
    section: str | None
    text: str
    page: int
    rects: list[dict]


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        # Bumped on every write that changes chunks, so in-memory search
        # indexes know when to rebuild.
        self._version = 0
        self._version_lock = threading.Lock()
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    @property
    def version(self) -> int:
        return self._version

    def _bump(self) -> None:
        with self._version_lock:
            self._version += 1

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            with conn:  # commits on success, rolls back on error
                yield conn
        finally:
            conn.close()

    # -- documents -------------------------------------------------------------

    def insert_document(self, doc_id: str, filename: str, size_bytes: int) -> DocumentRow:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO documents (id, filename, size_bytes, status, uploaded_at) "
                "VALUES (?, ?, ?, 'processing', ?)",
                (doc_id, filename, size_bytes, utc_now()),
            )
        doc = self.get_document(doc_id)
        assert doc is not None
        return doc

    def get_document(self, doc_id: str) -> DocumentRow | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        return _document_from_row(row) if row else None

    def list_documents(self) -> list[DocumentRow]:
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM documents ORDER BY uploaded_at DESC, filename").fetchall()
        return [_document_from_row(r) for r in rows]

    def documents_by_id(self, ids: Sequence[str]) -> dict[str, DocumentRow]:
        if not ids:
            return {}
        marks = ",".join("?" * len(ids))
        with self.connect() as conn:
            rows = conn.execute(f"SELECT * FROM documents WHERE id IN ({marks})", list(ids)).fetchall()
        return {r["id"]: _document_from_row(r) for r in rows}

    def update_document(self, doc_id: str, **fields: object) -> None:
        if "outline" in fields:
            fields["outline"] = json.dumps(fields["outline"])
        assignments = ", ".join(f"{k} = ?" for k in fields)
        with self.connect() as conn:
            conn.execute(f"UPDATE documents SET {assignments} WHERE id = ?", [*fields.values(), doc_id])

    def delete_document(self, doc_id: str) -> bool:
        with self.connect() as conn:
            deleted = conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,)).rowcount
        self._bump()
        return deleted > 0

    # -- chunks ----------------------------------------------------------------

    def replace_chunks(self, doc_id: str, chunks: Sequence[NewChunk]) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
            conn.executemany(
                "INSERT INTO chunks (id, document_id, idx, section, text, page, rects) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (f"{doc_id}:{i}", doc_id, i, c.section, c.text, c.page, json.dumps(c.rects))
                    for i, c in enumerate(chunks)
                ],
            )
        self._bump()

    def set_embeddings(self, chunk_ids: Sequence[str], vectors: np.ndarray, model: str) -> None:
        with self.connect() as conn:
            conn.executemany(
                "UPDATE chunks SET embedding = ?, embedding_model = ? WHERE id = ?",
                [
                    (vec.astype(np.float32).tobytes(), model, cid)
                    for cid, vec in zip(chunk_ids, vectors, strict=True)
                ],
            )
        self._bump()

    def chunks_for_document(self, doc_id: str) -> list[ChunkRow]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM chunks WHERE document_id = ? ORDER BY idx", (doc_id,)
            ).fetchall()
        return [_chunk_from_row(r) for r in rows]

    def chunks_by_id(self, ids: Sequence[str]) -> list[ChunkRow]:
        """Return chunks in the order of ``ids``, skipping unknown ids."""
        if not ids:
            return []
        marks = ",".join("?" * len(ids))
        with self.connect() as conn:
            rows = conn.execute(f"SELECT * FROM chunks WHERE id IN ({marks})", list(ids)).fetchall()
        by_id = {r["id"]: _chunk_from_row(r) for r in rows}
        return [by_id[i] for i in ids if i in by_id]

    def all_ready_chunks(self) -> list[ChunkRow]:
        """Every chunk belonging to a document that finished processing."""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT c.* FROM chunks c JOIN documents d ON d.id = c.document_id "
                "WHERE d.status = 'ready' ORDER BY c.document_id, c.idx"
            ).fetchall()
        return [_chunk_from_row(r) for r in rows]


def _document_from_row(row: sqlite3.Row) -> DocumentRow:
    return DocumentRow(
        id=row["id"],
        filename=row["filename"],
        title=row["title"],
        page_count=row["page_count"],
        size_bytes=row["size_bytes"],
        status=row["status"],
        search_mode=row["search_mode"],
        error=row["error"],
        outline=json.loads(row["outline"] or "[]"),
        uploaded_at=row["uploaded_at"],
    )


def _chunk_from_row(row: sqlite3.Row) -> ChunkRow:
    blob = row["embedding"]
    return ChunkRow(
        id=row["id"],
        document_id=row["document_id"],
        idx=row["idx"],
        section=row["section"],
        text=row["text"],
        page=row["page"],
        rects=json.loads(row["rects"]),
        embedding=np.frombuffer(blob, dtype=np.float32) if blob else None,
        embedding_model=row["embedding_model"],
    )
