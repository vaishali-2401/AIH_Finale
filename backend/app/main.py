"""FastAPI application factory.

Run in development with:  python -m app        (or)  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import analysis as analysis_routes
from app.api import documents as document_routes
from app.config import Settings
from app.db import Database
from app.deps import Services
from app.services.ai import AIClient, AIError, SpeechClient, build_ai, build_speech
from app.services.analysis import AIUnavailableError
from app.services.indexer import Indexer, Runner
from app.services.search import SearchIndex

log = logging.getLogger(__name__)
_DEFAULT = object()


def create_app(
    settings: Settings | None = None,
    *,
    ai: AIClient | object | None = _DEFAULT,
    speech: SpeechClient | object | None = _DEFAULT,
    runner: Runner | None = None,
) -> FastAPI:
    """Build the app. ``ai``, ``speech`` and ``runner`` can be overridden in tests."""
    settings = settings or Settings()
    ai_client = build_ai(settings) if ai is _DEFAULT else ai
    speech_client = build_speech(settings) if speech is _DEFAULT else speech

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    db = Database(settings.db_path)
    services = Services(
        settings=settings,
        db=db,
        ai=ai_client,  # type: ignore[arg-type]
        speech=speech_client,  # type: ignore[arg-type]
        index=SearchIndex(db, ai_client),  # type: ignore[arg-type]
        indexer=Indexer(db, ai_client, settings.uploads_dir, runner),  # type: ignore[arg-type]
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        services.indexer.resume_pending()
        yield
        services.indexer.shutdown()

    app = FastAPI(
        title="Connecting the Dots API",
        description="Upload PDFs, then discover related passages, insights and "
        "podcast-style summaries across your document library.",
        version="2.0.0",
        lifespan=lifespan,
    )
    app.state.services = services

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AIUnavailableError)
    async def _ai_unavailable(_: Request, exc: AIUnavailableError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(AIError)
    async def _ai_failed(_: Request, exc: AIError) -> JSONResponse:
        log.warning("AI request failed: %s", exc)
        return JSONResponse(status_code=502, content={"detail": f"The AI service failed: {exc}"})

    app.include_router(document_routes.router)
    app.include_router(analysis_routes.router)

    # Serve the exported frontend (single-port deployment). API routes are
    # registered first, so they take precedence over static files.
    if settings.frontend_dist and settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
        log.info("Serving frontend from %s", settings.frontend_dist)

    return app


def __getattr__(name: str):
    # Lazily create the module-level ``app`` for ``uvicorn app.main:app`` so
    # that importing this module (e.g. in tests) has no side effects.
    if name == "app":
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
        globals()["app"] = application = create_app()
        return application
    raise AttributeError(name)
