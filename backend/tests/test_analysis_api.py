import wave
from io import BytesIO

from tests.conftest import FakeAI, FakeSpeech, upload

SELECTION = "Where can I eat socca in Nice?"


def _library(make_client, sample_pdfs, **kwargs):
    client = make_client(**kwargs)
    upload(client, sample_pdfs["travel"], sample_pdfs["food"])
    return client


# -- connections ---------------------------------------------------------------


def test_keyword_connections_without_ai(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs)
    body = client.post("/api/connections", json={"text": SELECTION}).json()

    assert body["mode"] == "keyword"
    assert body["reranked"] is False
    top = body["connections"][0]
    assert top["document_title"] == "Taste of Provence"
    assert top["section"] == "Provencal Cuisine"
    assert "Socca" in top["snippet"]
    assert top["relation"] == "related"
    assert top["rects"] and top["page"] == 1


def test_semantic_connections_are_reranked_by_ai(make_client, sample_pdfs):
    ai = FakeAI()
    client = _library(make_client, sample_pdfs, ai=ai)
    body = client.post("/api/connections", json={"text": SELECTION}).json()

    assert body["mode"] == "semantic"
    assert body["reranked"] is True
    connections = body["connections"]
    assert connections[0]["relation"] == "contradicts"
    assert connections[0]["reason"] == "Reason for candidate 1"
    scores = [c["score"] for c in connections]
    assert scores == sorted(scores, reverse=True)
    assert all(s >= 0.4 for s in scores)  # min_relevance filter
    assert SELECTION in ai.prompts[-1]


def test_selection_source_chunk_is_excluded(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs)
    text = "Regional TER trains connect Nice, Cannes, Antibes and Monaco every half hour."
    body = client.post("/api/connections", json={"text": text}).json()
    assert all("TER trains" not in c["snippet"] for c in body["connections"])


def test_ai_failure_degrades_gracefully(make_client, sample_pdfs, tmp_path):
    data_dir = tmp_path / "lib"
    _library(make_client, sample_pdfs, ai=FakeAI(), data_dir=data_dir)
    client = make_client(ai=FakeAI(fail=True), data_dir=data_dir)
    response = client.post("/api/connections", json={"text": SELECTION})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "keyword"
    assert body["warning"]
    assert body["connections"]


def test_connections_validation(make_client):
    client = make_client()
    assert client.post("/api/connections", json={"text": "hi"}).status_code == 422
    empty = client.post("/api/connections", json={"text": "anything at all"}).json()
    assert empty["connections"] == []


# -- insights ------------------------------------------------------------------


def test_insights_require_ai(make_client):
    response = make_client().post("/api/insights", json={"text": SELECTION})
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_insights_with_ai_include_connected_passages(make_client, sample_pdfs):
    ai = FakeAI()
    client = _library(make_client, sample_pdfs, ai=ai)
    chunk_ids = [
        c["chunk_id"] for c in client.post("/api/connections", json={"text": SELECTION}).json()["connections"]
    ]
    body = client.post("/api/insights", json={"text": SELECTION, "chunk_ids": chunk_ids}).json()
    assert body["key_takeaways"] == ["Takeaway one", "Takeaway two"]
    assert "Taste of Provence, p. 1" in ai.prompts[-1]


def test_insights_upstream_failure_is_502(make_client):
    response = make_client(ai=FakeAI(fail=True)).post("/api/insights", json={"text": SELECTION})
    assert response.status_code == 502


# -- podcast -------------------------------------------------------------------


def test_podcast_without_any_key_uses_template_and_browser_tts(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs)
    chunk_ids = [
        c["chunk_id"] for c in client.post("/api/connections", json={"text": SELECTION}).json()["connections"]
    ]
    body = client.post("/api/podcast", json={"text": SELECTION, "chunk_ids": chunk_ids}).json()

    assert body["generated_by"] == "template"
    assert body["tts"] == "browser"
    assert body["audio_url"] is None
    assert body["lines"][0]["speaker"] == "Alex"
    assert any("Taste of Provence" in line["text"] for line in body["lines"])


def test_podcast_with_gemini_tts_returns_playable_audio(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs, ai=FakeAI(), speech=FakeSpeech())
    body = client.post("/api/podcast", json={"text": SELECTION}).json()

    assert body["generated_by"] == "ai"
    assert body["tts"] == "gemini"
    assert [line["speaker"] for line in body["lines"]] == ["Alex", "Jordan"]  # unknown speaker dropped
    audio = client.get(body["audio_url"])
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    with wave.open(BytesIO(audio.content)) as wav:
        assert wav.getframerate() == 24000


def test_podcast_falls_back_to_browser_when_tts_fails(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs, ai=FakeAI(), speech=FakeSpeech(fail=True))
    body = client.post("/api/podcast", json={"text": SELECTION}).json()
    assert body["tts"] == "browser"
    assert body["audio_url"] is None
    assert "quota" in body["tts_error"]
    assert body["generated_by"] == "ai"


def test_podcast_audio_rejects_bad_ids(make_client):
    client = make_client()
    assert client.get("/api/podcast/audio/../../app.db").status_code == 404
    assert client.get("/api/podcast/audio/" + "0" * 32).status_code == 404


def test_podcast_skips_unavailable_speech(make_client, sample_pdfs):
    client = _library(make_client, sample_pdfs, ai=FakeAI(), speech=FakeSpeech(available=False))
    assert client.get("/api/health").json()["tts"] == "browser"
    body = client.post("/api/podcast", json={"text": SELECTION}).json()
    assert body["tts"] == "browser"
    assert body["tts_error"] is None  # not attempted, so no error to report
