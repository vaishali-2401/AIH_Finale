import type {
  ConnectionsResponse,
  DocumentDetail,
  DocumentInfo,
  Health,
  Insights,
  Podcast,
  UploadResult,
} from "./types";

/** Empty in production, where the backend serves this app from the same origin. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the backend could not be reached at all. */
  get isNetworkError() {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Can't reach the server. Is the backend running?", 0);
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ");
    }
  } catch {
    // not JSON
  }
  return `Request failed (${response.status} ${response.statusText})`;
}

function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/api/health", { signal }),

  listDocuments: () => request<DocumentInfo[]>("/api/documents"),

  getDocument: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),

  uploadDocuments(files: File[]) {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request<{ results: UploadResult[] }>("/api/documents", { method: "POST", body: form });
  },

  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" }),

  reindexDocument: (id: string) =>
    request<DocumentInfo>(`/api/documents/${id}/reindex`, { method: "POST" }),

  fileUrl: (id: string) => `${API_BASE}/api/documents/${id}/file`,

  connections: (
    body: { text: string; document_id?: string; page?: number },
    signal?: AbortSignal,
  ) => postJson<ConnectionsResponse>("/api/connections", body, signal),

  insights: (body: { text: string; chunk_ids: string[] }, signal?: AbortSignal) =>
    postJson<Insights>("/api/insights", body, signal),

  podcast: (
    body: { text: string; chunk_ids: string[]; insights?: Insights | null },
    signal?: AbortSignal,
  ) => postJson<Podcast>("/api/podcast", body, signal),

  audioUrl: (path: string) => `${API_BASE}${path}`,
};

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
