"use client";

import { useCallback, useRef, useState } from "react";
import { api, errorText, isAbortError } from "@/lib/api";
import type { ConnectionsResponse, Insights, Podcast, Selection } from "@/lib/types";

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

const IDLE = { status: "idle" } as const;

/**
 * Everything derived from the current text selection: connections,
 * insights and the podcast. Starting a new analysis cancels in-flight
 * requests and clears results from the previous selection, so stale
 * responses can never overwrite newer ones.
 */
export function useAnalysis() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [connections, setConnections] = useState<AsyncState<ConnectionsResponse>>(IDLE);
  const [insights, setInsights] = useState<AsyncState<Insights>>(IDLE);
  const [podcast, setPodcast] = useState<AsyncState<Podcast>>(IDLE);
  const controllers = useRef<Record<string, AbortController>>({});

  const restart = (key: string) => {
    controllers.current[key]?.abort();
    const controller = new AbortController();
    controllers.current[key] = controller;
    return controller.signal;
  };

  const chunkIds = () =>
    connections.status === "success" ? connections.data.connections.map((c) => c.chunk_id) : [];

  const analyze = useCallback(async (next: Selection) => {
    const signal = restart("connections");
    controllers.current.insights?.abort();
    controllers.current.podcast?.abort();
    setSelection(next);
    setInsights(IDLE);
    setPodcast(IDLE);
    setConnections({ status: "loading" });
    try {
      const data = await api.connections(
        { text: next.text, document_id: next.documentId, page: next.page },
        signal,
      );
      setConnections({ status: "success", data });
    } catch (err) {
      if (!isAbortError(err)) setConnections({ status: "error", error: errorText(err) });
    }
  }, []);

  const loadInsights = async () => {
    if (!selection) return;
    const signal = restart("insights");
    setInsights({ status: "loading" });
    try {
      const data = await api.insights({ text: selection.text, chunk_ids: chunkIds() }, signal);
      setInsights({ status: "success", data });
    } catch (err) {
      if (!isAbortError(err)) setInsights({ status: "error", error: errorText(err) });
    }
  };

  const loadPodcast = async () => {
    if (!selection) return;
    const signal = restart("podcast");
    setPodcast({ status: "loading" });
    try {
      const data = await api.podcast(
        {
          text: selection.text,
          chunk_ids: chunkIds(),
          insights: insights.status === "success" ? insights.data : null,
        },
        signal,
      );
      setPodcast({ status: "success", data });
    } catch (err) {
      if (!isAbortError(err)) setPodcast({ status: "error", error: errorText(err) });
    }
  };

  const clear = useCallback(() => {
    Object.values(controllers.current).forEach((c) => c.abort());
    setSelection(null);
    setConnections(IDLE);
    setInsights(IDLE);
    setPodcast(IDLE);
  }, []);

  return { selection, connections, insights, podcast, analyze, loadInsights, loadPodcast, clear };
}
