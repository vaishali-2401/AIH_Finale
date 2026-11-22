"""Background processing of uploaded PDFs: parse -> chunk -> embed.

Uploads return immediately with ``status="processing"``; the frontend polls
``GET /api/documents`` until each document is ``ready`` or ``failed``.
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.db import Database
from app.services.ai import AIClient, AIError
from app.services.pdf_processing import PdfProcessingError, process_pdf

log = logging.getLogger(__name__)

Runner = Callable[[Callable[[], None]], None]


class Indexer:
    def __init__(
        self,
        db: Database,
        ai: AIClient | None,
        uploads_dir: Path,
        runner: Runner | None = None,
    ):
        self._db = db
        self._ai = ai
        self._uploads_dir = uploads_dir
        self._executor: ThreadPoolExecutor | None = None
        if runner is None:
            self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="indexer")
            runner = self._executor.submit  # type: ignore[assignment]
        self._run = runner

    def pdf_path(self, doc_id: str) -> Path:
        return self._uploads_dir / f"{doc_id}.pdf"

    def schedule(self, doc_id: str) -> None:
        self._db.update_document(doc_id, status="processing", error=None)
        self._run(lambda: self._process(doc_id))

    def resume_pending(self) -> None:
        """Called on startup: finish interrupted jobs and, when AI is now
        available, upgrade keyword-only documents to semantic search."""
        for doc in self._db.list_documents():
            needs_embeddings = (
                self._ai is not None and doc.status == "ready" and doc.search_mode != "semantic"
            )
            stale_model = (
                self._ai is not None
                and doc.status == "ready"
                and any(
                    c.embedding_model != self._ai.embedding_model
                    for c in self._db.chunks_for_document(doc.id)[:1]
                )
            )
            if doc.status == "processing" or needs_embeddings or stale_model:
                log.info("Re-indexing %s (%s)", doc.filename, doc.id)
                self.schedule(doc.id)

    def shutdown(self) -> None:
        if self._executor:
            self._executor.shutdown(wait=False, cancel_futures=True)

    def _process(self, doc_id: str) -> None:
        doc = self._db.get_document(doc_id)
        if doc is None:  # deleted while queued
            return
        try:
            result = process_pdf(self.pdf_path(doc_id), fallback_title=Path(doc.filename).stem)
        except PdfProcessingError as exc:
            log.warning("Failed to process %s: %s", doc.filename, exc)
            self._db.update_document(doc_id, status="failed", error=str(exc))
            return
        except Exception as exc:
            log.exception("Unexpected error processing %s", doc.filename)
            self._db.update_document(doc_id, status="failed", error=f"Unexpected error: {exc}")
            return

        try:
            self._db.replace_chunks(doc_id, result.chunks)
        except sqlite3.IntegrityError:
            return  # document was deleted while we were parsing it
        search_mode, warning = "keyword", None
        if self._ai is not None and result.chunks:
            chunks = self._db.chunks_for_document(doc_id)
            try:
                vectors = self._ai.embed([f"{c.section or ''}\n{c.text}".strip() for c in chunks])
                self._db.set_embeddings([c.id for c in chunks], vectors, self._ai.embedding_model)
                search_mode = "semantic"
            except AIError as exc:
                log.warning("Embedding failed for %s: %s", doc.filename, exc)
                warning = f"Semantic indexing failed, keyword search only: {exc}"

        if self._db.get_document(doc_id) is None:
            return  # deleted while processing; chunks were removed by cascade
        self._db.update_document(
            doc_id,
            title=result.title,
            page_count=result.page_count,
            outline=result.outline,
            status="ready",
            search_mode=search_mode,
            error=warning,
        )
        log.info(
            "Indexed %s: %d pages, %d chunks (%s)",
            doc.filename,
            result.page_count,
            len(result.chunks),
            search_mode,
        )
