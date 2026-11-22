"""Thin wrapper around the Gemini API (``google-genai`` SDK).

Every model call in the app goes through :class:`AIClient` so that:
  * the rest of the code never imports the SDK directly,
  * tests can substitute a fake implementation, and
  * the app can run with no API key at all (``ai`` is ``None``).
"""

from __future__ import annotations

import io
import logging
import wave
from typing import Protocol, TypeVar

import numpy as np
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import Settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

EMBED_BATCH = 100
TTS_SAMPLE_RATE = 24_000


class AIError(Exception):
    """A model call failed (network, quota, invalid response...)."""


class AIClient(Protocol):
    embedding_model: str

    def embed(self, texts: list[str], *, query: bool = False) -> np.ndarray:
        """Return L2-normalised embeddings, one row per input text."""
        ...

    def generate_json(self, prompt: str, schema: type[T], *, system: str | None = None) -> T:
        """Generate a response that validates against ``schema``."""
        ...


class SpeechClient(Protocol):
    def synthesize_dialogue(self, lines: list[tuple[str, str]], voices: dict[str, str]) -> bytes:
        """Render ``(speaker, text)`` lines to a WAV file and return its bytes."""
        ...


class GeminiAI:
    def __init__(self, settings: Settings):
        assert settings.gemini_api_key
        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._model = settings.gemini_model
        self.embedding_model = settings.embedding_model
        self._dim = settings.embedding_dim

    def embed(self, texts: list[str], *, query: bool = False) -> np.ndarray:
        config = types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT",
            output_dimensionality=self._dim,
        )
        vectors: list[list[float]] = []
        try:
            for start in range(0, len(texts), EMBED_BATCH):
                batch = texts[start : start + EMBED_BATCH]
                result = self._client.models.embed_content(
                    model=self.embedding_model, contents=batch, config=config
                )
                vectors.extend(e.values for e in result.embeddings or [])
        except Exception as exc:
            raise AIError(f"Embedding request failed: {exc}") from exc
        if len(vectors) != len(texts):
            raise AIError(f"Expected {len(texts)} embeddings, got {len(vectors)}")
        return normalize(np.asarray(vectors, dtype=np.float32))

    def generate_json(self, prompt: str, schema: type[T], *, system: str | None = None) -> T:
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.3,
            # These are short structured tasks; skipping "thinking" keeps latency low.
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        )
        try:
            response = self._client.models.generate_content(model=self._model, contents=prompt, config=config)
            return schema.model_validate_json(response.text or "")
        except Exception as exc:
            raise AIError(f"Gemini request failed: {exc}") from exc


class GeminiSpeech:
    def __init__(self, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def synthesize_dialogue(self, lines: list[tuple[str, str]], voices: dict[str, str]) -> bytes:
        transcript = "\n".join(f"{speaker}: {text}" for speaker, text in lines)
        prompt = (
            "Read this podcast conversation aloud in a warm, natural, conversational tone:\n" + transcript
        )
        config = types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                    speaker_voice_configs=[
                        types.SpeakerVoiceConfig(
                            speaker=speaker,
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                            ),
                        )
                        for speaker, voice in voices.items()
                    ]
                )
            ),
        )
        try:
            response = self._client.models.generate_content(model=self._model, contents=prompt, config=config)
            pcm = response.candidates[0].content.parts[0].inline_data.data  # type: ignore[index,union-attr]
        except Exception as exc:
            raise AIError(f"Text-to-speech request failed: {exc}") from exc
        if not pcm:
            raise AIError("Text-to-speech returned no audio")
        return pcm_to_wav(pcm)


def pcm_to_wav(pcm: bytes, sample_rate: int = TTS_SAMPLE_RATE) -> bytes:
    """Wrap raw 16-bit mono PCM (what Gemini TTS returns) in a WAV container."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buffer.getvalue()


def normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return matrix / norms


def build_ai(settings: Settings) -> AIClient | None:
    if not settings.ai_enabled:
        log.warning("GEMINI_API_KEY is not set: AI features are disabled, keyword search only.")
        return None
    return GeminiAI(settings)


def build_speech(settings: Settings) -> SpeechClient | None:
    key = settings.effective_tts_key
    if not key:
        log.info("Gemini TTS unavailable: podcasts will use the browser's speech synthesis.")
        return None
    return GeminiSpeech(key, settings.tts_model)
