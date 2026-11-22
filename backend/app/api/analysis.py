"""Connections, insights and podcast endpoints, plus the health check."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import FileResponse

from app.deps import Services, get_services
from app.schemas import (
    ConnectionsRequest,
    ConnectionsResponse,
    HealthResponse,
    Insights,
    InsightsRequest,
    PodcastRequest,
    PodcastResponse,
)
from app.services import analysis

router = APIRouter(prefix="/api", tags=["analysis"])
Svc = Annotated[Services, Depends(get_services)]


@router.get("/health", response_model=HealthResponse, tags=["meta"], summary="Service status")
def health(svc: Svc) -> HealthResponse:
    return HealthResponse(
        status="ok",
        ai_enabled=svc.ai is not None,
        tts="gemini" if svc.speech is not None else "browser",
        model=svc.settings.gemini_model if svc.ai is not None else None,
        documents=len(svc.db.list_documents()),
    )


@router.post("/connections", response_model=ConnectionsResponse, summary="Find related passages")
def connections(svc: Svc, body: ConnectionsRequest) -> ConnectionsResponse:
    """Passages across the library that relate to the selected text, each
    labelled as supporting, contradicting, exemplifying or related to it."""
    return analysis.find_connections(body, db=svc.db, index=svc.index, ai=svc.ai, settings=svc.settings)


@router.post("/insights", response_model=Insights, summary="Generate insights (needs Gemini)")
def insights(svc: Svc, body: InsightsRequest) -> Insights:
    return analysis.generate_insights(body.text, body.chunk_ids, db=svc.db, ai=svc.ai)


@router.post("/podcast", response_model=PodcastResponse, summary="Generate a podcast episode")
def podcast(svc: Svc, body: PodcastRequest) -> PodcastResponse:
    """Returns a two-speaker script. ``audio_url`` is set when Gemini TTS
    produced audio; otherwise ``tts="browser"`` tells the client to read the
    script with the browser's speech synthesis."""
    return analysis.generate_podcast(body, db=svc.db, ai=svc.ai, speech=svc.speech, settings=svc.settings)


@router.get(
    "/podcast/audio/{audio_id}",
    response_class=FileResponse,
    summary="Podcast audio (WAV)",
    responses={200: {"content": {"audio/wav": {}}}},
)
def podcast_audio(svc: Svc, audio_id: Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]) -> FileResponse:
    path = svc.settings.audio_dir / f"{audio_id}.wav"
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found or expired")
    return FileResponse(path, media_type="audio/wav")
