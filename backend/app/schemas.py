"""Request / response models for the HTTP API.

These double as the API documentation served at ``/docs``; the frontend's
``src/lib/types.ts`` mirrors them.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Relation = Literal["supports", "contradicts", "example", "related"]


# -- documents -----------------------------------------------------------------


class OutlineItem(BaseModel):
    level: str
    title: str
    page: int


class DocumentOut(BaseModel):
    id: str
    filename: str
    title: str | None
    page_count: int | None
    size_bytes: int
    status: Literal["processing", "ready", "failed"]
    search_mode: Literal["semantic", "keyword"] | None
    error: str | None
    uploaded_at: str


class DocumentDetail(DocumentOut):
    outline: list[OutlineItem]


class UploadResult(BaseModel):
    filename: str
    document: DocumentOut | None = None
    duplicate: bool = False
    error: str | None = None


class UploadResponse(BaseModel):
    results: list[UploadResult]


# -- analysis ------------------------------------------------------------------


class Rect(BaseModel):
    """A highlight rectangle, as fractions (0-1) of the page width/height."""

    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class ConnectionsRequest(BaseModel):
    text: str = Field(min_length=3, max_length=5000, description="The text the user selected.")
    document_id: str | None = Field(None, description="Document the selection came from.")
    page: int | None = Field(None, ge=1, description="1-based page of the selection.")


class Connection(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    page: int
    section: str | None
    snippet: str
    rects: list[Rect]
    relation: Relation
    reason: str | None = None
    score: float = Field(ge=0, le=1)


class ConnectionsResponse(BaseModel):
    mode: Literal["semantic", "keyword"]
    reranked: bool
    connections: list[Connection]
    warning: str | None = None


class InsightsRequest(BaseModel):
    text: str = Field(min_length=3, max_length=5000)
    chunk_ids: list[str] = Field(default_factory=list, max_length=10)


class Contradiction(BaseModel):
    statement: str
    source: str
    explanation: str


class Insights(BaseModel):
    summary: str
    key_takeaways: list[str]
    contradictions: list[Contradiction]
    examples: list[str]
    did_you_know: list[str]


class PodcastRequest(BaseModel):
    text: str = Field(min_length=3, max_length=5000)
    chunk_ids: list[str] = Field(default_factory=list, max_length=10)
    insights: Insights | None = None


class PodcastLine(BaseModel):
    speaker: str
    text: str


class PodcastResponse(BaseModel):
    title: str
    lines: list[PodcastLine]
    generated_by: Literal["ai", "template"]
    tts: Literal["gemini", "browser"]
    audio_url: str | None = None
    tts_error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    ai_enabled: bool
    tts: Literal["gemini", "browser"]
    model: str | None
    documents: int


# -- structured LLM outputs (sent to Gemini as response schemas) -----------------


class RankedCandidate(BaseModel):
    index: int = Field(description="Number of the candidate passage.")
    relation: Relation
    relevance: float = Field(description="0-1: how useful this passage is to the reader.")
    reason: str = Field(description="One short sentence explaining the connection.")


class RerankResult(BaseModel):
    items: list[RankedCandidate]


class PodcastScript(BaseModel):
    title: str
    lines: list[PodcastLine]
