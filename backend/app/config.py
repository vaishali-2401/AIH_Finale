"""Application settings, loaded from environment variables and ``backend/.env``."""

from __future__ import annotations

from functools import cached_property
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini. GOOGLE_API_KEY is accepted for backwards compatibility.
    gemini_api_key: str | None = Field(
        default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY")
    )
    # Text model, tried first. When it is retired, overloaded or rate limited,
    # the comma-separated fallbacks are tried in order.
    gemini_model: str = "gemini-3.5-flash-lite"
    gemini_fallback_models: str = "gemini-3.6-flash,gemini-3.5-flash,gemini-3.8-flash"
    ai_timeout_seconds: int = 25
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 768

    # Podcast text-to-speech. Falls back to the browser when unavailable.
    tts_enabled: bool = True
    tts_api_key: str | None = None
    tts_model: str = "gemini-2.5-flash-preview-tts"
    tts_fallback_models: str = "gemini-3.1-flash-tts-preview,gemini-3.8-flash-lite-tts"
    tts_voice_host: str = "Kore"
    tts_voice_guest: str = "Puck"

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = BACKEND_DIR / "data"
    cors_origins: str = "http://localhost:3000"
    frontend_dist: Path | None = None

    # Limits
    max_upload_mb: int = 50
    max_files_per_upload: int = 30

    # Search tuning
    candidate_pool: int = 20
    max_connections: int = 5
    min_relevance: float = 0.4

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def effective_tts_key(self) -> str | None:
        if not self.tts_enabled:
            return None
        return self.tts_api_key or self.gemini_api_key

    @property
    def fallback_model_list(self) -> list[str]:
        return [m.strip() for m in self.gemini_fallback_models.split(",") if m.strip()]

    @property
    def tts_fallback_model_list(self) -> list[str]:
        return [m.strip() for m in self.tts_fallback_models.split(",") if m.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @cached_property
    def resolved_data_dir(self) -> Path:
        path = self.data_dir if self.data_dir.is_absolute() else BACKEND_DIR / self.data_dir
        return path.resolve()

    @property
    def uploads_dir(self) -> Path:
        return self.resolved_data_dir / "uploads"

    @property
    def audio_dir(self) -> Path:
        return self.resolved_data_dir / "audio"

    @property
    def db_path(self) -> Path:
        return self.resolved_data_dir / "app.db"
