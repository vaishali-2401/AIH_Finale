// Mirrors backend/app/schemas.py. Keep the two in sync.

export type DocumentStatus = "processing" | "ready" | "failed";
export type SearchMode = "semantic" | "keyword";
export type Relation = "supports" | "contradicts" | "example" | "related";

export interface DocumentInfo {
  id: string;
  filename: string;
  title: string | null;
  page_count: number | null;
  size_bytes: number;
  status: DocumentStatus;
  search_mode: SearchMode | null;
  error: string | null;
  uploaded_at: string;
}

export interface OutlineItem {
  level: string; // "H1" | "H2" | "H3"
  title: string;
  page: number;
}

export interface DocumentDetail extends DocumentInfo {
  outline: OutlineItem[];
}

export interface UploadResult {
  filename: string;
  document: DocumentInfo | null;
  duplicate: boolean;
  error: string | null;
}

/** A highlight rectangle as fractions (0-1) of the page width/height. */
export interface Rect {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Connection {
  chunk_id: string;
  document_id: string;
  document_title: string;
  page: number;
  section: string | null;
  snippet: string;
  rects: Rect[];
  relation: Relation;
  reason: string | null;
  score: number;
}

export interface ConnectionsResponse {
  mode: SearchMode;
  reranked: boolean;
  connections: Connection[];
  warning: string | null;
}

export interface Contradiction {
  statement: string;
  source: string;
  explanation: string;
}

export interface Insights {
  summary: string;
  key_takeaways: string[];
  contradictions: Contradiction[];
  examples: string[];
  did_you_know: string[];
}

export interface PodcastLine {
  speaker: string;
  text: string;
}

export interface Podcast {
  title: string;
  lines: PodcastLine[];
  generated_by: "ai" | "template";
  tts: "gemini" | "browser";
  audio_url: string | null;
  tts_error: string | null;
}

export interface Health {
  status: "ok";
  ai_enabled: boolean;
  tts: "gemini" | "browser";
  model: string | null;
  documents: number;
}

/** The text the user selected in the viewer. */
export interface Selection {
  text: string;
  documentId: string;
  page: number;
}
