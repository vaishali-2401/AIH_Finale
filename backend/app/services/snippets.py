"""Focus a connection on the part of a chunk that actually matches.

Chunks are a few paragraphs long. Showing (and highlighting) the whole chunk
buries the relevant sentence, so we pick the sentence that shares the most
words with the reader's selection, build the snippet around it, and keep
only the highlight rectangles that cover it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.search import tokenize

# Sentence ends, and list bullets (common in PDFs) as separators.
_SENTENCE = re.compile(r"[^.!?•]+(?:[.!?]+|$)")


@dataclass(slots=True)
class Focus:
    snippet: str
    rects: list[dict]


def _sentences(text: str) -> list[tuple[int, int]]:
    spans = []
    for match in _SENTENCE.finditer(text):
        start, end = match.start(), match.end()
        while start < end and text[start] in " •":
            start += 1
        if end - start > 1:
            spans.append((start, end))
    return spans or [(0, len(text))]


def focus(text: str, rects: list[dict], query: str, limit: int = 600) -> Focus:
    terms = set(tokenize(query))
    spans = _sentences(text)
    scores = [len(terms & set(tokenize(text[s:e]))) for s, e in spans]
    best = max(range(len(spans)), key=lambda i: (scores[i], -i))

    if scores[best] == 0:
        # Nothing in common lexically (a purely semantic match): show the start.
        return Focus(_clip(text, 0, limit), _strip(rects))

    # Start at the best sentence (cards show only the first few lines) and add
    # following sentences for context while they fit.
    lo, hi = best, best
    while hi + 1 < len(spans) and spans[hi + 1][1] - spans[lo][0] <= limit:
        hi += 1
    start, end = spans[lo][0], spans[hi][1]
    snippet = text[start:end].strip()
    if len(snippet) > limit:
        snippet = _clip(snippet, 0, limit)
    if start > 0:
        snippet = "…" + snippet
    if end < len(text.rstrip()) and not snippet.endswith("…"):
        snippet += "…"

    # Highlight only rectangles overlapping the best sentence, when the chunk
    # recorded character offsets (start >= 0); otherwise highlight everything.
    s0, s1 = spans[best]
    if rects and all(r.get("start", -1) >= 0 for r in rects):
        focused = [r for r in rects if r["start"] < s1 and r["end"] > s0]
        if focused:
            return Focus(snippet, _strip(focused))
    return Focus(snippet, _strip(rects))


def _clip(text: str, start: int, limit: int) -> str:
    piece = text[start : start + limit]
    if start + limit >= len(text):
        return piece
    return piece.rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _strip(rects: list[dict]) -> list[dict]:
    """Drop internal character offsets before sending rectangles to clients."""
    return [{k: r[k] for k in ("page", "x0", "y0", "x1", "y1")} for r in rects]
