"""GeminiAI model selection: fallback on retired/overloaded models and
model-specific thinking settings. Uses a fake SDK client (no network)."""

from types import SimpleNamespace

import pytest

from app.config import Settings
from app.schemas import RerankResult
from app.services.ai import AIError, GeminiAI, _thinking_config

OK_JSON = '{"items": [{"index": 1, "relation": "contradicts", "relevance": 0.9, "reason": "r"}]}'


class FakeAPIError(Exception):
    def __init__(self, code: int, message: str = "error"):
        super().__init__(f"{code} {message}")
        self.code = code


class FakeModels:
    """``behaviour[model]`` is a list of outcomes consumed per call: an
    exception to raise, or a string response body."""

    def __init__(self, behaviour: dict[str, list]):
        self.behaviour = behaviour
        self.calls: list[tuple[str, bool]] = []  # (model, had thinking config)

    def generate_content(self, *, model, contents, config):
        self.calls.append((model, config.thinking_config is not None))
        outcomes = self.behaviour.get(model) or [FakeAPIError(404, "not found")]
        outcome = outcomes.pop(0) if len(outcomes) > 1 else outcomes[0]
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


def make_ai(behaviour, model="primary", fallbacks="backup-1,backup-2"):
    settings = Settings(
        _env_file=None, GEMINI_API_KEY="test", gemini_model=model, gemini_fallback_models=fallbacks
    )
    models = FakeModels(behaviour)
    return GeminiAI(settings, client=SimpleNamespace(models=models)), models


def test_uses_primary_model_when_it_works():
    ai, models = make_ai({"primary": [OK_JSON]})
    assert ai.generate_json("p", RerankResult).items[0].relation == "contradicts"
    assert [m for m, _ in models.calls] == ["primary"]


def test_retired_model_is_skipped_permanently():
    ai, models = make_ai({"primary": [FakeAPIError(404)], "backup-1": [OK_JSON]})
    ai.generate_json("p", RerankResult)
    ai.generate_json("p", RerankResult)
    assert [m for m, _ in models.calls] == ["primary", "backup-1", "backup-1"]
    assert ai.active_model == "backup-1"


@pytest.mark.parametrize("code", [429, 500, 503, 504])
def test_overloaded_model_cools_down(code):
    ai, models = make_ai({"primary": [FakeAPIError(code), OK_JSON], "backup-1": [OK_JSON]})
    ai.generate_json("p", RerankResult)
    ai.generate_json("p", RerankResult)  # primary is cooling down, so backup-1 again
    assert [m for m, _ in models.calls] == ["primary", "backup-1", "backup-1"]


def test_model_rejecting_thinking_config_is_retried_without_it():
    ai, models = make_ai(
        {"primary": [FakeAPIError(400, "thinking_budget is not supported"), OK_JSON, OK_JSON]}
    )
    ai.generate_json("p", RerankResult)
    ai.generate_json("p", RerankResult)
    assert models.calls == [("primary", True), ("primary", False), ("primary", False)]


def test_invalid_request_does_not_fall_back():
    ai, models = make_ai({"primary": [FakeAPIError(400, "invalid argument")], "backup-1": [OK_JSON]})
    with pytest.raises(AIError, match="invalid argument"):
        ai.generate_json("p", RerankResult)
    assert [m for m, _ in models.calls] == ["primary"]


def test_all_models_failing_raises_ai_error():
    ai, _ = make_ai({m: [FakeAPIError(503)] for m in ("primary", "backup-1", "backup-2")})
    with pytest.raises(AIError, match="503"):
        ai.generate_json("p", RerankResult)


def test_all_models_retired_gives_actionable_message():
    ai, _ = make_ai({})
    with pytest.raises(AIError):
        ai.generate_json("p", RerankResult)
    with pytest.raises(AIError, match="Set GEMINI_MODEL"):
        ai.generate_json("p", RerankResult)


def test_thinking_config_matches_model_generation():
    assert _thinking_config("gemini-2.5-flash").thinking_budget == 0
    assert _thinking_config("gemini-3.5-flash-lite").thinking_level is not None


# -- embeddings: background indexing waits out rate limits ----------------------


class FakeEmbedModels:
    def __init__(self, failures: list[Exception]):
        self.failures = failures
        self.calls = 0

    def embed_content(self, *, model, contents, config):
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0, 0.0]) for _ in contents])


def make_embedder(failures):
    settings = Settings(_env_file=None, GEMINI_API_KEY="test")
    models = FakeEmbedModels(failures)
    ai = GeminiAI(settings, client=SimpleNamespace(models=models))
    sleeps: list[float] = []
    ai._sleep = sleeps.append
    return ai, models, sleeps


def test_document_embedding_retries_rate_limits():
    ai, models, sleeps = make_embedder([FakeAPIError(429), FakeAPIError(503)])
    vectors = ai.embed(["a", "b"])
    assert vectors.shape == (2, 2)
    assert models.calls == 3
    assert sleeps == [5, 10]


def test_query_embedding_fails_fast():
    ai, models, sleeps = make_embedder([FakeAPIError(429)])
    with pytest.raises(AIError):
        ai.embed(["q"], query=True)
    assert (models.calls, sleeps) == (1, [])


def test_embedding_gives_up_after_retries():
    ai, _, sleeps = make_embedder([FakeAPIError(429)] * 4)
    with pytest.raises(AIError, match="429"):
        ai.embed(["a"])
    assert sleeps == [5, 10, 20]


# -- speech: fallback across TTS models -----------------------------------------


class FakeSpeechModels:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls: list[str] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append(model)
        outcome = self.behaviour.get(model, FakeAPIError(404))
        if isinstance(outcome, Exception):
            raise outcome
        part = SimpleNamespace(
            inline_data=SimpleNamespace(data=outcome, mime_type="audio/L16;codec=pcm;rate=16000")
        )
        return SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[part]))])


def test_speech_falls_back_and_reads_sample_rate():
    import io
    import wave

    from app.services.ai import GeminiSpeech

    models = FakeSpeechModels({"tts-b": b"\x00\x00" * 160})
    speech = GeminiSpeech("k", ["tts-a", "tts-b"], client=SimpleNamespace(models=models))
    wav = speech.synthesize_dialogue([("Alex", "Hi")], {"Alex": "Kore"})
    with wave.open(io.BytesIO(wav)) as w:
        assert w.getframerate() == 16000
    assert models.calls == ["tts-a", "tts-b"]
    assert speech.available  # tts-b still works

    speech.synthesize_dialogue([("Alex", "Hi")], {"Alex": "Kore"})
    assert models.calls[-1] == "tts-b"  # retired tts-a is not retried


def test_speech_becomes_unavailable_when_no_model_exists():
    from app.services.ai import GeminiSpeech

    speech = GeminiSpeech("k", ["tts-a"], client=SimpleNamespace(models=FakeSpeechModels({})))
    with pytest.raises(AIError):
        speech.synthesize_dialogue([("Alex", "Hi")], {"Alex": "Kore"})
    assert speech.available is False
