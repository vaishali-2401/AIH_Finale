"""Shared service container, created once per app and injected into routes."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.config import Settings
from app.db import Database
from app.services.ai import AIClient, SpeechClient
from app.services.indexer import Indexer
from app.services.search import SearchIndex


@dataclass
class Services:
    settings: Settings
    db: Database
    ai: AIClient | None
    speech: SpeechClient | None
    index: SearchIndex
    indexer: Indexer


def get_services(request: Request) -> Services:
    return request.app.state.services
