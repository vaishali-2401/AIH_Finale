"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import type { DocumentInfo, UploadResult } from "@/lib/types";

const POLL_MS = 2000;

/** The document library: list, upload, delete and retry, polling the server
 *  while any document is still being processed. */
export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocuments(await api.listDocuments());
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const processing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const upload = useCallback(
    async (files: File[]): Promise<UploadResult[]> => {
      setUploading(true);
      try {
        const { results } = await api.uploadDocuments(files);
        await refresh();
        return results;
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(async (id: string) => {
    await api.deleteDocument(id);
    setDocuments((docs) => docs.filter((d) => d.id !== id));
  }, []);

  const reindex = useCallback(async (id: string) => {
    const updated = await api.reindexDocument(id);
    setDocuments((docs) => docs.map((d) => (d.id === id ? updated : d)));
  }, []);

  return { documents, loading, error, uploading, refresh, upload, remove, reindex };
}
