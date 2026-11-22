"""Shared fixtures: generated sample PDFs, fake AI clients and a test app."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Iterator
from pathlib import Path

import numpy as np
import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas import (
    Contradiction,
    Insights,
    PodcastLine,
    PodcastScript,
    RankedCandidate,
    RerankResult,
)
from app.services.ai import AIError, normalize, pcm_to_wav
from app.services.search import tokenize

Section = tuple[str, list[str]]

TRAVEL_GUIDE: list[Section] = [
    (
        "Beaches of Nice",
        [
            "The beaches of Nice are covered in smooth pebbles rather than sand. In July and "
            "August the public beaches along the Promenade des Anglais become very crowded, so "
            "arrive early in the morning to find a spot near the water.",
            "Private beach clubs rent sun loungers and umbrellas by the day and serve lunch on "
            "the sand-free shore. Water shoes make walking on the pebbles far more comfortable.",
        ],
    ),
    (
        "Getting Around",
        [
            "Regional TER trains connect Nice, Cannes, Antibes and Monaco every half hour. A "
            "train ticket is cheaper than parking and avoids the summer traffic on the coast road.",
        ],
    ),
]
FOOD_GUIDE: list[Section] = [
    (
        "Provencal Cuisine",
        [
            "Bouillabaisse is the famous fish stew of Marseille, traditionally made with rockfish, "
            "saffron, fennel and orange peel and served with rouille on toasted bread.",
            "Socca, a thin chickpea pancake baked in a wood oven, is the classic street food of "
            "Nice and is best eaten hot from the old town market stalls.",
        ],
    ),
    (
        "Wine Regions",
        [
            "Provence is the largest producer of rosé wine in France. The pale, dry rosés of the "
            "Côtes de Provence pair well with grilled fish and summer salads.",
        ],
    ),
]


def make_pdf(path: Path, title: str, sections: list[Section]) -> Path:
    """Write a simple PDF: a large bold title, bold section headings and body
    paragraphs, laid out top to bottom with page breaks as needed."""
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72.0

    def write(text: str, size: float, font: str, gap: float) -> None:
        nonlocal page, y
        height = size * 1.4 * (len(text) * size * 0.5 // 450 + 2)
        if y + height > page.rect.height - 72:
            page = doc.new_page()
            y = 72.0
        rect = pymupdf.Rect(72, y, page.rect.width - 72, y + height)
        page.insert_textbox(rect, text, fontsize=size, fontname=font)
        y += height + gap

    write(title, 24, "hebo", 12)
    for heading, paragraphs in sections:
        write(heading, 16, "hebo", 4)
        for paragraph in paragraphs:
            write(paragraph, 11, "helv", 8)
    doc.set_metadata({"title": ""})
    doc.save(path)
    doc.close()
    return path


@pytest.fixture
def sample_pdfs(tmp_path: Path) -> dict[str, Path]:
    folder = tmp_path / "pdfs"
    folder.mkdir()
    return {
        "travel": make_pdf(folder / "travel.pdf", "Riviera Travel Guide", TRAVEL_GUIDE),
        "food": make_pdf(folder / "food.pdf", "Taste of Provence", FOOD_GUIDE),
    }


class FakeAI:
    """Deterministic stand-in for Gemini.

    Embeddings are hashed bags of words, so texts sharing vocabulary are
    similar. ``generate_json`` returns canned objects for each schema.
    """

    embedding_model = "fake-embedding"

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.prompts: list[str] = []

    def embed(self, texts: list[str], *, query: bool = False) -> np.ndarray:
        if self.fail:
            raise AIError("simulated embedding outage")
        matrix = np.zeros((len(texts), 256), dtype=np.float32)
        for row, text in enumerate(texts):
            for tok in tokenize(text):
                matrix[row, int(hashlib.md5(tok.encode()).hexdigest(), 16) % 256] += 1
        return normalize(matrix)

    def generate_json(self, prompt, schema, *, system=None):
        self.prompts.append(prompt)
        if self.fail:
            raise AIError("simulated generation outage")
        if schema is RerankResult:
            count = len(re.findall(r"^\[\d+\]", prompt, re.M))
            return RerankResult(
                items=[
                    RankedCandidate(
                        index=i,
                        relation="contradicts" if i == 1 else "supports",
                        relevance=round(0.95 - 0.1 * i, 2),
                        reason=f"Reason for candidate {i}",
                    )
                    for i in range(1, count + 1)
                ]
            )
        if schema is Insights:
            return Insights(
                summary="A summary.",
                key_takeaways=["Takeaway one", "Takeaway two"],
                contradictions=[Contradiction(statement="X", source="Doc, p. 1", explanation="Y")],
                examples=["An example"],
                did_you_know=["A fact"],
            )
        if schema is PodcastScript:
            return PodcastScript(
                title="Episode",
                lines=[
                    PodcastLine(speaker="Alex", text="Hi Jordan!"),
                    PodcastLine(speaker="Narrator", text="(dropped: unknown speaker)"),
                    PodcastLine(speaker="Jordan", text="Hi Alex."),
                ],
            )
        raise AssertionError(f"Unexpected schema {schema}")


class FakeSpeech:
    def __init__(self, fail: bool = False):
        self.fail = fail

    def synthesize_dialogue(self, lines, voices) -> bytes:
        if self.fail:
            raise AIError("simulated TTS quota exceeded")
        return pcm_to_wav(b"\x00\x00" * 2400)


@pytest.fixture
def make_client(tmp_path: Path, monkeypatch) -> Iterator[Callable[..., TestClient]]:
    """Factory for a TestClient with an isolated data dir. Indexing runs
    synchronously so tests can assert on results immediately."""
    for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "TTS_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    clients: list[TestClient] = []

    def factory(ai=None, speech=None, data_dir: Path | None = None) -> TestClient:
        settings = Settings(_env_file=None, data_dir=data_dir or tmp_path / "data")
        app = create_app(settings, ai=ai, speech=speech, runner=lambda job: job())
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


def upload(client: TestClient, *paths: Path) -> dict:
    files = [("files", (p.name, p.read_bytes(), "application/pdf")) for p in paths]
    response = client.post("/api/documents", files=files)
    assert response.status_code == 200, response.text
    return response.json()
