"""In-memory search over every chunk in the library.

Two retrieval modes:
  * semantic — cosine similarity between Gemini embeddings (when AI is on and
    chunks have embeddings from the configured model);
  * keyword  — TF-IDF cosine similarity, used when no API key is configured.

The index is rebuilt lazily whenever the database version changes, so uploads
and deletions are picked up on the next query.
"""

from __future__ import annotations

import math
import re
import threading
from collections import Counter
from dataclasses import dataclass

import numpy as np

from app.db import ChunkRow, Database
from app.services.ai import AIClient

STOPWORDS = frozenset(
    [
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "also",
        "am",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "doing",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "has",
        "have",
        "having",
        "he",
        "her",
        "here",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "itself",
        "just",
        "me",
        "more",
        "most",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "now",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "she",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whom",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
        "one",
        "two",
        "may",
        "might",
        "must",
        "shall",
        "us",
        "via",
        "per",
    ]
)
TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


def tokenize(text: str) -> list[str]:
    tokens = []
    for tok in TOKEN.findall(text.lower()):
        if len(tok) < 2 or tok in STOPWORDS:
            continue
        if len(tok) > 4 and tok.endswith("s") and not tok.endswith("ss"):
            tok = tok[:-1]  # crude plural folding: "hotels" -> "hotel"
        tokens.append(tok)
    return tokens


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text.lower())).strip()


@dataclass(slots=True)
class Candidate:
    chunk: ChunkRow
    score: float  # 0-1


@dataclass(slots=True)
class _Snapshot:
    version: int
    chunks: list[ChunkRow]
    normalized: list[str]
    # semantic
    embedded_idx: np.ndarray  # positions of chunks with a usable embedding
    matrix: np.ndarray | None
    # keyword
    term_weights: list[dict[str, float]]
    idf: dict[str, float]


class SearchIndex:
    def __init__(self, db: Database, ai: AIClient | None):
        self._db = db
        self._ai = ai
        self._lock = threading.Lock()
        self._snapshot: _Snapshot | None = None

    @property
    def mode(self) -> str:
        snap = self._get()
        return "semantic" if self._ai and snap.matrix is not None else "keyword"

    def candidates(self, text: str, limit: int) -> list[Candidate]:
        """Best-matching chunks for ``text``, best first.

        Chunks that contain the text verbatim are skipped: that is where the
        selection came from (or an exact copy of it), so it adds nothing."""
        snap = self._get()
        if not snap.chunks:
            return []

        if self.mode == "semantic":
            assert self._ai is not None and snap.matrix is not None
            query = self._ai.embed([text], query=True)[0]
            sims = snap.matrix @ query
            scored = [(int(snap.embedded_idx[i]), float(s)) for i, s in enumerate(sims)]
        else:
            scored = list(enumerate(_tfidf_scores(text, snap)))

        needle = normalize_text(text)[:150]
        results: list[Candidate] = []
        for pos, score in sorted(scored, key=lambda p: p[1], reverse=True):
            if score <= 0:
                break
            if needle and needle in snap.normalized[pos]:
                continue
            results.append(Candidate(snap.chunks[pos], min(score, 1.0)))
            if len(results) >= limit:
                break
        return results

    # -- snapshot management -------------------------------------------------

    def _get(self) -> _Snapshot:
        version = self._db.version
        with self._lock:
            if self._snapshot is None or self._snapshot.version != version:
                self._snapshot = self._build(version)
            return self._snapshot

    def _build(self, version: int) -> _Snapshot:
        chunks = self._db.all_ready_chunks()
        model = self._ai.embedding_model if self._ai else None
        embedded = [i for i, c in enumerate(chunks) if c.embedding is not None and c.embedding_model == model]
        matrix = np.vstack([chunks[i].embedding for i in embedded]) if embedded else None

        doc_freq: Counter[str] = Counter()
        term_counts = []
        for c in chunks:
            counts = Counter(tokenize(f"{c.section or ''} {c.text}"))
            term_counts.append(counts)
            doc_freq.update(counts.keys())
        n = len(chunks)
        idf = {t: math.log((1 + n) / (1 + df)) + 1 for t, df in doc_freq.items()}
        term_weights = [
            _unit({t: (1 + math.log(tf)) * idf[t] for t, tf in counts.items()}) for counts in term_counts
        ]

        return _Snapshot(
            version=version,
            chunks=chunks,
            normalized=[normalize_text(c.text) for c in chunks],
            embedded_idx=np.asarray(embedded, dtype=np.int64),
            matrix=matrix,
            term_weights=term_weights,
            idf=idf,
        )


def _unit(weights: dict[str, float]) -> dict[str, float]:
    norm = math.sqrt(sum(w * w for w in weights.values())) or 1.0
    return {t: w / norm for t, w in weights.items()}


def _tfidf_scores(text: str, snap: _Snapshot) -> list[float]:
    counts = Counter(t for t in tokenize(text) if t in snap.idf)
    if not counts:
        return [0.0] * len(snap.chunks)
    query = _unit({t: (1 + math.log(tf)) * snap.idf[t] for t, tf in counts.items()})
    return [sum(w * weights.get(t, 0.0) for t, w in query.items()) for weights in snap.term_weights]
