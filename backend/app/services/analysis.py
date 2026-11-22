"""The three reader-facing features: connections, insights and podcasts.

All functions are stateless: everything they need arrives in the request
(selected text + the ids of connected chunks), so results never leak between
documents or users. This replaces the old ``results.jsonl`` / ``bulb.jsonl``
files that every request shared.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from app.config import Settings
from app.db import ChunkRow, Database
from app.schemas import (
    Connection,
    ConnectionsRequest,
    ConnectionsResponse,
    Insights,
    PodcastLine,
    PodcastRequest,
    PodcastResponse,
    PodcastScript,
    Rect,
    RerankResult,
)
from app.services.ai import AIClient, AIError, SpeechClient
from app.services.search import Candidate, SearchIndex

log = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You help a reader connect ideas across their personal library of PDF documents. "
    "Base every statement only on the passages provided; never invent facts or sources."
)
HOST, GUEST = "Alex", "Jordan"
SNIPPET_CHARS = 600
PROMPT_PASSAGE_CHARS = 900
MAX_AUDIO_FILES = 20
KEYWORD_MIN_SCORE = 0.05


class AIUnavailableError(Exception):
    """The feature needs Gemini but no API key is configured."""


# -- connections ---------------------------------------------------------------


def find_connections(
    req: ConnectionsRequest,
    *,
    db: Database,
    index: SearchIndex,
    ai: AIClient | None,
    settings: Settings,
) -> ConnectionsResponse:
    mode = index.mode
    warning = None
    try:
        candidates = index.candidates(req.text, settings.candidate_pool)
    except AIError as exc:  # query embedding failed: degrade to keyword search
        log.warning("Semantic search failed, using keywords: %s", exc)
        candidates = SearchIndex(db, None).candidates(req.text, settings.candidate_pool)
        mode, warning = "keyword", "AI search is unavailable right now; showing keyword matches."
    if mode == "keyword":
        candidates = [c for c in candidates if c.score >= KEYWORD_MIN_SCORE]

    titles = _document_titles(db, [c.chunk for c in candidates])

    if ai is not None and candidates:
        try:
            ranked = _rerank(ai, req, candidates, titles)
            connections = [
                _to_connection(candidates[r.index - 1], titles, r.relation, r.reason, r.relevance)
                for r in ranked
                if r.relevance >= settings.min_relevance
            ][: settings.max_connections]
            return ConnectionsResponse(mode=mode, reranked=True, connections=connections, warning=warning)
        except AIError as exc:
            log.warning("Re-ranking failed, returning raw search order: %s", exc)
            warning = "AI ranking is unavailable right now; showing closest matches."

    connections = [
        _to_connection(c, titles, "related", None, c.score) for c in candidates[: settings.max_connections]
    ]
    return ConnectionsResponse(mode=mode, reranked=False, connections=connections, warning=warning)


def _rerank(ai: AIClient, req: ConnectionsRequest, candidates: list[Candidate], titles: dict[str, str]):
    passages = "\n\n".join(
        f"[{i}] {_source_label(c.chunk, titles)}\n{_truncate(c.chunk.text, PROMPT_PASSAGE_CHARS)}"
        for i, c in enumerate(candidates, start=1)
    )
    prompt = f"""The reader selected this text:
\"\"\"{req.text}\"\"\"

Candidate passages from their library:

{passages}

For every candidate that genuinely helps the reader understand, question or extend the
selected text, return an item with:
- index: the candidate number
- relation: "supports" (agrees with or reinforces it), "contradicts" (conflicting claim,
  figure or recommendation), "example" (a concrete instance or illustration of it) or
  "related" (useful background on the same topic)
- relevance: 0 to 1
- reason: one specific sentence (max 25 words) saying how it connects
Leave out candidates that are off-topic or merely repeat the selected text.
Order items from most to least relevant."""
    result = ai.generate_json(prompt, RerankResult, system=SYSTEM_PROMPT)
    seen: set[int] = set()
    ranked = []
    for item in sorted(result.items, key=lambda r: r.relevance, reverse=True):
        if 1 <= item.index <= len(candidates) and item.index not in seen:
            seen.add(item.index)
            item.relevance = min(max(item.relevance, 0.0), 1.0)
            ranked.append(item)
    return ranked


def _to_connection(
    candidate: Candidate, titles: dict[str, str], relation, reason: str | None, score: float
) -> Connection:
    chunk = candidate.chunk
    return Connection(
        chunk_id=chunk.id,
        document_id=chunk.document_id,
        document_title=titles.get(chunk.document_id, "Untitled document"),
        page=chunk.page,
        section=chunk.section,
        snippet=_truncate(chunk.text, SNIPPET_CHARS),
        rects=[Rect(**r) for r in chunk.rects],
        relation=relation,
        reason=reason,
        score=round(min(max(score, 0.0), 1.0), 3),
    )


# -- insights ------------------------------------------------------------------


def generate_insights(text: str, chunk_ids: list[str], *, db: Database, ai: AIClient | None) -> Insights:
    if ai is None:
        raise AIUnavailableError("Insights need a Gemini API key (set GEMINI_API_KEY).")
    chunks = db.chunks_by_id(chunk_ids)
    titles = _document_titles(db, chunks)
    context = _format_passages(chunks, titles) or "(no related passages were found)"
    prompt = f"""The reader is studying this text:
\"\"\"{text}\"\"\"

Related passages from their library:

{context}

Write insights that help the reader:
- summary: 2-3 sentences on what the selected text says and how the passages relate to it
- key_takeaways: 3-5 short, specific points
- contradictions: places where a passage disagrees with the selected text or another
  passage (statement, source as "Document, p. N", explanation). Empty list if none.
- examples: concrete examples from the passages that illustrate the ideas. Empty if none.
- did_you_know: 1-3 surprising or non-obvious facts drawn from the passages."""
    return ai.generate_json(prompt, Insights, system=SYSTEM_PROMPT)


# -- podcast -------------------------------------------------------------------


def generate_podcast(
    req: PodcastRequest,
    *,
    db: Database,
    ai: AIClient | None,
    speech: SpeechClient | None,
    settings: Settings,
) -> PodcastResponse:
    chunks = db.chunks_by_id(req.chunk_ids)
    titles = _document_titles(db, chunks)

    script, generated_by = None, "template"
    if ai is not None:
        try:
            script = _ai_script(ai, req, chunks, titles)
            generated_by = "ai"
        except AIError as exc:
            log.warning("AI podcast script failed, using template: %s", exc)
    if script is None:
        script = _template_script(req.text, chunks, titles)

    response = PodcastResponse(
        title=script.title, lines=script.lines, generated_by=generated_by, tts="browser"
    )
    if speech is None:
        return response
    try:
        wav = speech.synthesize_dialogue(
            [(line.speaker, line.text) for line in script.lines],
            {HOST: settings.tts_voice_host, GUEST: settings.tts_voice_guest},
        )
    except AIError as exc:
        log.warning("Gemini TTS failed, falling back to browser speech: %s", exc)
        response.tts_error = str(exc)
        return response
    audio_id = _save_audio(settings.audio_dir, wav)
    response.tts = "gemini"
    response.audio_url = f"/api/podcast/audio/{audio_id}"
    return response


def _ai_script(
    ai: AIClient, req: PodcastRequest, chunks: list[ChunkRow], titles: dict[str, str]
) -> PodcastScript:
    insights = req.insights.model_dump_json(indent=1) if req.insights else "(none)"
    prompt = f"""Write a short two-person podcast episode (about 2-3 minutes spoken,
roughly 300-450 words) between {HOST} (curious host) and {GUEST} (knowledgeable guest).

Topic — the text the listener selected:
\"\"\"{req.text}\"\"\"

Related passages from the listener's documents:
{_format_passages(chunks, titles) or "(none)"}

Insights already generated:
{insights}

Rules: {HOST} opens and asks questions; {GUEST} explains using ONLY the material above,
naming which document an idea comes from and pointing out agreements or contradictions.
Natural, friendly spoken language; no stage directions, sound effects or markdown.
Every line's speaker must be exactly "{HOST}" or "{GUEST}"."""
    script = ai.generate_json(prompt, PodcastScript, system=SYSTEM_PROMPT)
    lines = [line for line in script.lines if line.speaker in (HOST, GUEST) and line.text.strip()]
    if not lines:
        raise AIError("Podcast script had no usable lines")
    return PodcastScript(title=script.title, lines=lines)


def _template_script(text: str, chunks: list[ChunkRow], titles: dict[str, str]) -> PodcastScript:
    """A simple scripted walkthrough used when Gemini is not available."""
    lines = [
        PodcastLine(
            speaker=HOST, text=f"Welcome back! Today we're looking at this passage: {_truncate(text, 400)}"
        ),
    ]
    if not chunks:
        lines.append(
            PodcastLine(
                speaker=GUEST,
                text="I couldn't find related passages in the library yet, "
                "so upload a few more documents and try again.",
            )
        )
    for i, chunk in enumerate(chunks[:4]):
        source = _source_label(chunk, titles)
        lines.append(
            PodcastLine(
                speaker=HOST, text="What else in the library touches on this?" if i == 0 else "Anything else?"
            )
        )
        lines.append(PodcastLine(speaker=GUEST, text=f"From {source}: {_truncate(chunk.text, 350)}"))
    lines.append(PodcastLine(speaker=HOST, text="Great connections. Thanks for listening!"))
    return PodcastScript(title="Connections overview", lines=lines)


def _save_audio(audio_dir: Path, wav: bytes) -> str:
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_id = uuid.uuid4().hex
    (audio_dir / f"{audio_id}.wav").write_bytes(wav)
    # Keep only the most recent files.
    files = sorted(audio_dir.glob("*.wav"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[MAX_AUDIO_FILES:]:
        old.unlink(missing_ok=True)
    return audio_id


# -- helpers -------------------------------------------------------------------


def _document_titles(db: Database, chunks: list[ChunkRow]) -> dict[str, str]:
    docs = db.documents_by_id(sorted({c.document_id for c in chunks}))
    return {doc_id: d.title or Path(d.filename).stem for doc_id, d in docs.items()}


def _source_label(chunk: ChunkRow, titles: dict[str, str]) -> str:
    label = f"{titles.get(chunk.document_id, 'Untitled document')}, p. {chunk.page}"
    return f"{label} ({chunk.section})" if chunk.section else label


def _format_passages(chunks: list[ChunkRow], titles: dict[str, str]) -> str:
    return "\n\n".join(
        f"- {_source_label(c, titles)}:\n{_truncate(c.text, PROMPT_PASSAGE_CHARS)}" for c in chunks
    )


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "…"
