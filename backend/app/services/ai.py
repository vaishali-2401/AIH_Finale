"""Thin wrapper around the Gemini API (``google-genai`` SDK).

Every model call in the app goes through :class:`AIClient` so that:
  * the rest of the code never imports the SDK directly,
  * tests can substitute a fake implementation, and
  * the app can run with no API key at all (``ai`` is ``None``).

Gemini models are retired for new keys and get overloaded from time to time,
so text generation tries a list of models: the configured one first, then the
fallbacks. A model that reports "not found" is dropped for the rest of the
process; one that is overloaded, rate limited or times out is skipped for a
cool-down period.
"""

from __future__ import annotations

import io
import logging
import re
import threading
import time
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
EMBED_RETRY_DELAYS = [10, 30, 60]  # free-tier limits reset per minute
TTS_SAMPLE_RATE = 24_000
COOLDOWN_SECONDS = 300
# Status codes worth trying another model for: rate limited, server errors, timeouts.
TRANSIENT_CODES = {408, 429, 500, 502, 503, 504}


class AIError(Exception):
    """A model call failed (network, quota, invalid response...)."""


class AIClient(Protocol):
    embedding_model: str

    @property
    def active_model(self) -> str:
        """The text model the next request will try first."""
        ...

    def embed(self, texts: list[str], *, query: bool = False) -> np.ndarray:
        """Return L2-normalised embeddings, one row per input text."""
        ...

    def generate_json(self, prompt: str, schema: type[T], *, system: str | None = None) -> T:
        """Generate a response that validates against ``schema``."""
        ...


class SpeechClient(Protocol):
    @property
    def available(self) -> bool:
        """False once the TTS model turned out not to exist for this key."""
        ...

    def synthesize_dialogue(self, lines: list[tuple[str, str]], voices: dict[str, str]) -> bytes:
        """Render ``(speaker, text)`` lines to a WAV file and return its bytes."""
        ...


def _http_options(timeout_s: int, api_version: str | None = None) -> types.HttpOptions:
    # One attempt per model: falling back to another model is faster than the
    # SDK's built-in retries against an overloaded one.
    return types.HttpOptions(
        api_version=api_version,
        timeout=timeout_s * 1000,
        retry_options=types.HttpRetryOptions(attempts=1),
    )


def _status_code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    if "timeout" in type(exc).__name__.lower() or "timed out" in str(exc).lower():
        return 408
    return None


def _thinking_config(model: str) -> types.ThinkingConfig:
    """Keep "thinking" minimal: these are short structured tasks where latency
    matters. Gemini 2.x uses a token budget, Gemini 3+ a thinking level."""
    if model.startswith("gemini-2"):
        return types.ThinkingConfig(thinking_budget=0)
    return types.ThinkingConfig(thinking_level="low")


class GeminiAI:
    def __init__(self, settings: Settings, client: genai.Client | None = None):
        assert settings.gemini_api_key
        self._client = client or genai.Client(
            api_key=settings.gemini_api_key, http_options=_http_options(settings.ai_timeout_seconds)
        )
        self._models = list(dict.fromkeys([settings.gemini_model, *settings.fallback_model_list]))
        self.embedding_model = settings.embedding_model
        self._dim = settings.embedding_dim
        self._lock = threading.Lock()
        self._retired: set[str] = set()
        self._cooldown_until: dict[str, float] = {}
        self._no_thinking: set[str] = set()
        self._sleep = time.sleep  # replaced in tests

    @property
    def active_model(self) -> str:
        candidates = self._candidates()
        return candidates[0] if candidates else self._models[0]

    def _candidates(self) -> list[str]:
        now = time.monotonic()
        with self._lock:
            usable = [m for m in self._models if m not in self._retired]
            ready = [m for m in usable if self._cooldown_until.get(m, 0) <= now]
        # If every model is cooling down, try them anyway rather than failing outright.
        return ready or usable

    def embed(self, texts: list[str], *, query: bool = False) -> np.ndarray:
        config = types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT",
            output_dimensionality=self._dim,
        )
        # Document indexing runs in the background, so it waits out rate limits
        # (common on the free tier when several PDFs are uploaded at once).
        # Queries fail fast: a user is waiting and keyword search is the fallback.
        delays = [] if query else EMBED_RETRY_DELAYS
        vectors: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            for attempt in range(len(delays) + 1):
                try:
                    result = self._client.models.embed_content(
                        model=self.embedding_model, contents=batch, config=config
                    )
                    break
                except Exception as exc:
                    if attempt < len(delays) and _status_code(exc) in TRANSIENT_CODES:
                        log.info("Embedding rate limited/unavailable; retrying in %ss", delays[attempt])
                        self._sleep(delays[attempt])
                        continue
                    raise AIError(f"Embedding request failed: {exc}") from exc
            vectors.extend(e.values for e in result.embeddings or [])
        if len(vectors) != len(texts):
            raise AIError(f"Expected {len(texts)} embeddings, got {len(vectors)}")
        return normalize(np.asarray(vectors, dtype=np.float32))

    def generate_json(self, prompt: str, schema: type[T], *, system: str | None = None) -> T:
        candidates = self._candidates()
        if not candidates:
            raise AIError(
                "None of the configured Gemini models are available to this API key. "
                "Set GEMINI_MODEL to a current model (see https://ai.google.dev/gemini-api/docs/models)."
            )
        last_error: Exception | None = None
        for model in candidates:
            try:
                return self._generate(model, prompt, schema, system)
            except Exception as exc:
                last_error = exc
                if not self._handle_failure(model, exc):
                    break
        raise AIError(f"Gemini request failed: {last_error}") from last_error

    def _generate(self, model: str, prompt: str, schema: type[T], system: str | None) -> T:
        def call(with_thinking: bool) -> T:
            config = types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.3,
                thinking_config=_thinking_config(model) if with_thinking else None,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )
            response = self._client.models.generate_content(model=model, contents=prompt, config=config)
            return schema.model_validate_json(response.text or "")

        if model in self._no_thinking:
            return call(with_thinking=False)
        try:
            return call(with_thinking=True)
        except Exception as exc:
            # Some models reject thinking settings; remember and retry without.
            if _status_code(exc) == 400 and "thinking" in str(exc).lower():
                with self._lock:
                    self._no_thinking.add(model)
                return call(with_thinking=False)
            raise

    def _handle_failure(self, model: str, exc: Exception) -> bool:
        """Record why ``model`` failed. Returns True if another model is worth trying."""
        code = _status_code(exc)
        with self._lock:
            if code == 404:
                self._retired.add(model)
                log.warning("Gemini model %s is not available to this key; not using it again.", model)
                return True
            if code in TRANSIENT_CODES:
                self._cooldown_until[model] = time.monotonic() + COOLDOWN_SECONDS
                log.warning("Gemini model %s failed (%s); trying the next model.", model, code)
                return True
        return False  # e.g. invalid request or unparsable output: another model won't help


class GeminiSpeech:
    """Multi-speaker text-to-speech. Speech output is only offered on the
    ``v1beta`` API, so this client pins that version."""

    def __init__(self, api_key: str, models: list[str], timeout_s: int = 120, client=None):
        self._client = client or genai.Client(
            api_key=api_key, http_options=_http_options(timeout_s, api_version="v1beta")
        )
        self._models = list(dict.fromkeys(models))
        self._retired: set[str] = set()

    @property
    def available(self) -> bool:
        return any(m not in self._retired for m in self._models)

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
        last_error: Exception | None = None
        for model in [m for m in self._models if m not in self._retired]:
            try:
                response = self._client.models.generate_content(model=model, contents=prompt, config=config)
                audio = response.candidates[0].content.parts[0].inline_data  # type: ignore[index,union-attr]
            except Exception as exc:
                last_error = exc
                code = _status_code(exc)
                if code == 404:
                    self._retired.add(model)
                    log.warning("TTS model %s is not available to this key.", model)
                    continue
                if code in TRANSIENT_CODES:
                    log.warning("TTS model %s failed (%s); trying the next one.", model, code)
                    continue
                break
            if not audio or not audio.data:
                last_error = AIError(f"{model} returned no audio")
                continue
            return pcm_to_wav(audio.data, _sample_rate(audio.mime_type))
        if not self.available:
            log.warning("No TTS model is available to this key; using browser speech from now on.")
        raise AIError(f"Text-to-speech request failed: {last_error}") from last_error


def _sample_rate(mime_type: str | None) -> int:
    """Parse e.g. ``audio/L16;codec=pcm;rate=24000``."""
    match = re.search(r"rate=(\d+)", mime_type or "")
    return int(match.group(1)) if match else TTS_SAMPLE_RATE


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
    return GeminiSpeech(key, [settings.tts_model, *settings.tts_fallback_model_list])
