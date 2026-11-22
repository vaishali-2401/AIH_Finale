import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, errorText, isAbortError } from "../api";

function mockFetch(response: Partial<Response> | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (status: number, body: unknown, statusText = "") =>
  ({ ok: status < 400, status, statusText, json: async () => body }) as Partial<Response>;

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("returns parsed JSON on success", async () => {
    const fetch = mockFetch(json(200, [{ id: "abc" }]));
    await expect(api.listDocuments()).resolves.toEqual([{ id: "abc" }]);
    expect(fetch).toHaveBeenCalledWith("/api/documents", undefined);
  });

  it("surfaces FastAPI string details as the error message", async () => {
    mockFetch(json(503, { detail: "Insights need a Gemini API key (set GEMINI_API_KEY)." }));
    const error = await api.insights({ text: "hello", chunk_ids: [] }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toContain("GEMINI_API_KEY");
  });

  it("joins FastAPI validation errors", async () => {
    mockFetch(json(422, { detail: [{ msg: "String should have at least 3 characters" }, { msg: "bad page" }] }));
    await expect(api.connections({ text: "hi" })).rejects.toThrow(
      "String should have at least 3 characters; bad page",
    );
  });

  it("falls back to the status line for non-JSON errors", async () => {
    mockFetch({ ok: false, status: 500, statusText: "Internal Server Error", json: async () => {
      throw new SyntaxError("not json");
    } });
    await expect(api.listDocuments()).rejects.toThrow("Request failed (500 Internal Server Error)");
  });

  it("reports network failures as status 0", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    const error = await api.health().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toMatch(/backend running/);
  });

  it("re-throws aborts untouched so callers can ignore them", async () => {
    mockFetch(new DOMException("aborted", "AbortError"));
    const error = await api.listDocuments().catch((e) => e);
    expect(isAbortError(error)).toBe(true);
  });

  it("handles 204 No Content", async () => {
    mockFetch({ ok: true, status: 204, json: async () => ({}) });
    await expect(api.deleteDocument("0123456789abcdef")).resolves.toBeUndefined();
  });

  it("sends JSON bodies for analysis requests", async () => {
    const fetch = mockFetch(json(200, { mode: "keyword", reranked: false, connections: [], warning: null }));
    await api.connections({ text: "selected text", document_id: "d", page: 2 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/connections");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "selected text", document_id: "d", page: 2 });
  });

  it("builds file and audio URLs", () => {
    expect(api.fileUrl("abc")).toBe("/api/documents/abc/file");
    expect(api.audioUrl("/api/podcast/audio/x")).toBe("/api/podcast/audio/x");
  });

  it("errorText falls back for non-errors", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("weird")).toBe("Something went wrong.");
  });
});
