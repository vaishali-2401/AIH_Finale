"use client";

import { RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { cn, documentName, formatBytes, formatRelativeTime } from "@/lib/format";
import type { DocumentInfo } from "@/lib/types";

interface DocumentItemProps {
  doc: DocumentInfo;
  active: boolean;
  onOpen: () => void;
  onDelete: () => Promise<void>;
  onRetry: () => void;
}

export default function DocumentItem({ doc, active, onOpen, onDelete, onRetry }: DocumentItemProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Cancel a pending delete confirmation after a few seconds.
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const failed = doc.status === "failed";
  const processing = doc.status === "processing";

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={failed}
        aria-current={active ? "true" : undefined}
        className={cn(
          "relative flex w-full items-start border-b border-line py-3 pr-10 pl-4 text-left transition-colors",
          active ? "bg-surface-2" : "hover:bg-surface-2",
          failed && "cursor-default",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute inset-y-2.5 left-0 w-0.5", active ? "bg-ink" : "bg-transparent")}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "line-clamp-2 font-serif text-[14.5px] leading-snug",
              failed ? "text-ink-3 line-through decoration-ink-3" : "text-ink",
              active && "font-semibold",
            )}
          >
            {documentName(doc)}
          </span>
          <span className="mt-1 flex items-center gap-1 font-mono text-[10.5px] text-ink-3">
            {processing ? (
              <>
                <Spinner className="size-3" /> Indexing…
              </>
            ) : failed ? (
              <span className="text-danger">{doc.error ?? "Processing failed"}</span>
            ) : (
              <>
                <span title={`Added ${formatRelativeTime(doc.uploaded_at)}`}>
                  {doc.page_count} {doc.page_count === 1 ? "page" : "pages"} · {formatBytes(doc.size_bytes)}
                </span>
                {doc.error && (
                  <span title={doc.error} className="ml-0.5 inline-flex text-warning">
                    <TriangleAlert className="size-3" aria-hidden />
                    <span className="sr-only">{doc.error}</span>
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </button>

      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 bg-surface-2",
          !confirming && "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {failed && (
          <IconButton label="Retry processing" size="sm" onClick={onRetry}>
            <RotateCw className="size-3.5" />
          </IconButton>
        )}
        {confirming ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="h-7 bg-danger px-2 text-[12px] font-medium text-white"
          >
            {deleting ? "Deleting…" : "Delete?"}
          </button>
        ) : (
          <IconButton label={`Delete ${documentName(doc)}`} size="sm" onClick={handleDelete}>
            <Trash2 className="size-3.5" />
          </IconButton>
        )}
      </div>
    </li>
  );
}
