"""Turn a PDF into a title, an outline and searchable, highlightable chunks.

Headings are detected from PyMuPDF's font information (size and weight
relative to the document's body text), which gives exact page numbers and
positions. When the PDF ships its own bookmarks (table of contents) those are
used for the outline instead.

Each chunk is a run of consecutive text blocks inside one section, capped at
roughly ``TARGET_WORDS`` words, and records the rectangles of its blocks as
fractions of the page size so the frontend can highlight it at any zoom level.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from app.db import NewChunk

TARGET_WORDS = 220
MIN_WORDS = 40
MAX_HEADING_WORDS = 15
MAX_OUTLINE_LEVELS = 3


@dataclass(slots=True)
class Block:
    page: int  # 1-based
    text: str
    size: float  # dominant font size
    bold: bool
    rect: dict  # {page, x0, y0, x1, y1} as page fractions

    @property
    def words(self) -> int:
        return len(self.text.split())


@dataclass(slots=True)
class ProcessedPdf:
    title: str
    page_count: int
    outline: list[dict] = field(default_factory=list)
    chunks: list[NewChunk] = field(default_factory=list)


class PdfProcessingError(Exception):
    """Raised when a file cannot be opened or contains no extractable text."""


def process_pdf(path: Path, fallback_title: str) -> ProcessedPdf:
    try:
        doc = pymupdf.open(path)
    except Exception as exc:  # PyMuPDF raises several unrelated types
        raise PdfProcessingError(f"Could not open PDF: {exc}") from exc

    with doc:
        if doc.needs_pass:
            raise PdfProcessingError("PDF is password protected")
        blocks = _extract_blocks(doc)
        if not blocks:
            raise PdfProcessingError("PDF contains no extractable text (is it a scanned image?)")

        body_size = _body_font_size(blocks)
        heading_levels = _heading_levels(blocks, body_size)
        title = _pick_title(doc, blocks, heading_levels, fallback_title)
        outline = _toc_outline(doc) or _relevel(
            [
                {"level": heading_levels[id(b)], "title": b.text, "page": b.page}
                for b in blocks
                if id(b) in heading_levels and not (b.page == 1 and b.text == title)
            ]
        )
        chunks = _build_chunks(blocks, heading_levels)
        return ProcessedPdf(title=title, page_count=doc.page_count, outline=outline, chunks=chunks)


# -- extraction ----------------------------------------------------------------


def _extract_blocks(doc: pymupdf.Document) -> list[Block]:
    blocks: list[Block] = []
    for page_index, page in enumerate(doc):
        width, height = page.rect.width or 1, page.rect.height or 1
        # Expand ligatures ("ﬄ" -> "ffl") so words stay searchable.
        flags = pymupdf.TEXTFLAGS_TEXT & ~pymupdf.TEXT_PRESERVE_LIGATURES
        data = page.get_text("dict", sort=True, flags=flags)
        for raw in data["blocks"]:
            if raw.get("type") != 0:
                continue
            sizes: Counter[float] = Counter()
            bold_chars = total_chars = 0
            lines = []
            for line in raw["lines"]:
                line_text = "".join(span["text"] for span in line["spans"]).strip()
                if line_text:
                    lines.append(line_text)
                for span in line["spans"]:
                    n = len(span["text"].strip())
                    sizes[round(span["size"] * 2) / 2] += n
                    total_chars += n
                    if span["flags"] & pymupdf.TEXT_FONT_BOLD or "bold" in span["font"].lower():
                        bold_chars += n
            text = _clean(" ".join(lines))
            if not text or total_chars == 0:
                continue
            x0, y0, x1, y1 = raw["bbox"]
            blocks.append(
                Block(
                    page=page_index + 1,
                    text=text,
                    size=sizes.most_common(1)[0][0],
                    bold=bold_chars / total_chars > 0.6,
                    rect={
                        "page": page_index + 1,
                        "x0": round(max(0.0, x0 / width), 4),
                        "y0": round(max(0.0, y0 / height), 4),
                        "x1": round(min(1.0, x1 / width), 4),
                        "y1": round(min(1.0, y1 / height), 4),
                    },
                )
            )
    return blocks


LIGATURES = str.maketrans({"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬆ": "st"})


def _clean(text: str) -> str:
    text = text.translate(LIGATURES).replace("­", "")  # ligatures, soft hyphens
    text = re.sub(r"(\w)- (\w)", r"\1\2", text)  # words hyphenated across lines
    return re.sub(r"\s+", " ", text).strip()


# -- headings ------------------------------------------------------------------


def _body_font_size(blocks: list[Block]) -> float:
    weights: Counter[float] = Counter()
    for b in blocks:
        weights[b.size] += len(b.text)
    return weights.most_common(1)[0][0]


def _looks_like_heading(block: Block, body_size: float) -> bool:
    text = block.text
    if block.words > MAX_HEADING_WORDS or len(text) > 120 or is_likely_junk(text):
        return False
    if text.endswith((".", ",", ";")) and not re.match(r"^\d+(\.\d+)*\.?\s", text):
        return False
    bigger = block.size >= body_size * 1.15
    bold_label = block.bold and block.size >= body_size * 0.95
    return bigger or bold_label


def _heading_levels(blocks: list[Block], body_size: float) -> dict[int, str]:
    """Map ``id(block)`` -> "H1"/"H2"/"H3" for blocks that look like headings.

    Distinct heading font sizes are ranked largest-first; the largest becomes
    H1. Bold body-sized labels are always the lowest level.
    """
    candidates = [b for b in blocks if _looks_like_heading(b, body_size)]
    sizes = sorted({b.size for b in candidates if b.size >= body_size * 1.15}, reverse=True)
    rank = {size: min(i, MAX_OUTLINE_LEVELS - 1) for i, size in enumerate(sizes)}
    lowest = min(len(sizes), MAX_OUTLINE_LEVELS - 1)
    return {id(b): f"H{rank.get(b.size, lowest) + 1}" for b in candidates}


def _relevel(outline: list[dict]) -> list[dict]:
    """Shift levels so the highest remaining heading is H1 (e.g. after the
    document title, usually the only H1, has been removed)."""
    if not outline:
        return outline
    top = min(int(item["level"][1:]) for item in outline)
    return [{**item, "level": f"H{int(item['level'][1:]) - top + 1}"} for item in outline]


def _toc_outline(doc: pymupdf.Document) -> list[dict]:
    return [
        {"level": f"H{min(level, MAX_OUTLINE_LEVELS)}", "title": _clean(title), "page": max(page, 1)}
        for level, title, page, *_ in doc.get_toc(simple=True)
        if _clean(title)
    ]


def _pick_title(doc: pymupdf.Document, blocks: list[Block], levels: dict[int, str], fallback: str) -> str:
    meta_title = _clean((doc.metadata or {}).get("title") or "")
    if len(meta_title.split()) >= 2 and not re.search(r"\.(docx?|pdf|pptx?)$|^untitled", meta_title, re.I):
        return meta_title
    first_page = [b for b in blocks if b.page == 1 and id(b) in levels]
    if first_page:
        return max(first_page, key=lambda b: b.size).text
    return fallback


JUNK_PATTERNS = [
    re.compile(r"(page\s*)?\d+(\s*(of|/)\s*\d+)?", re.I),  # page numbers
    re.compile(r"\d+"),  # bare numbers
    re.compile(r"m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})\.?", re.I),  # roman numerals
    re.compile(r"\W+"),  # punctuation only
]
DATE_PATTERN = re.compile(
    r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|"
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b",
    re.I,
)


def is_likely_junk(text: str) -> bool:
    """True for strings that are page furniture rather than headings
    (page numbers, dates, copyright lines, stray punctuation)."""
    text = text.strip()
    if len(text) < 3:
        return True
    if any(p.fullmatch(text) for p in JUNK_PATTERNS):
        return True
    if DATE_PATTERN.search(text) or re.search(r"copyright|©|all rights reserved", text, re.I):
        return True
    alnum = len(re.sub(r"[^\w\s]", "", text))
    return alnum < len(text) * 0.5


# -- chunking ------------------------------------------------------------------


def _build_chunks(blocks: list[Block], levels: dict[int, str]) -> list[NewChunk]:
    chunks: list[NewChunk] = []
    section: str | None = None
    pending: list[Block] = []

    def flush() -> None:
        if pending:
            chunks.extend(_make_chunks(pending, section))
            pending.clear()

    for block in blocks:
        if id(block) in levels:
            flush()
            section = block.text
            continue
        pending.append(block)
        if sum(b.words for b in pending) >= TARGET_WORDS:
            flush()
    flush()
    return _merge_small(chunks)


def _make_chunks(blocks: list[Block], section: str | None) -> list[NewChunk]:
    text = " ".join(b.text for b in blocks)
    words = text.split()
    if len(words) <= TARGET_WORDS * 2:
        # Record which characters of the chunk text each rectangle covers, so a
        # connection can highlight just the matching part of a long chunk.
        rects, pos = [], 0
        for b in blocks:
            rects.append({**b.rect, "start": pos, "end": pos + len(b.text)})
            pos += len(b.text) + 1
        return [NewChunk(section=section, text=text, page=blocks[0].page, rects=rects)]
    # A single enormous block (e.g. text extracted without paragraph breaks):
    # split on sentence boundaries; every piece shares the block rectangles.
    # Offsets are unknown (-1), so the whole area is highlighted.
    shared = [{**b.rect, "start": -1, "end": -1} for b in blocks]
    pieces: list[NewChunk] = []
    current: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        current.append(sentence)
        if sum(len(s.split()) for s in current) >= TARGET_WORDS:
            pieces.append(NewChunk(section, " ".join(current), blocks[0].page, [dict(r) for r in shared]))
            current = []
    if current:
        pieces.append(NewChunk(section, " ".join(current), blocks[0].page, [dict(r) for r in shared]))
    return pieces


def _merge_small(chunks: list[NewChunk]) -> list[NewChunk]:
    """Fold chunks shorter than ``MIN_WORDS`` into the previous chunk of the same section."""
    merged: list[NewChunk] = []
    for chunk in chunks:
        prev = merged[-1] if merged else None
        if prev and prev.section == chunk.section and len(chunk.text.split()) < MIN_WORDS:
            shift = len(prev.text) + 1
            prev.text = f"{prev.text} {chunk.text}"
            prev.rects.extend(
                {**r, "start": r["start"] + shift, "end": r["end"] + shift} if r["start"] >= 0 else r
                for r in chunk.rects
            )
        else:
            merged.append(chunk)
    return merged
