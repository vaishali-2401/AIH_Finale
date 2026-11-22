"use client";

import { CircleAlert, FileText, RotateCw, Trash2, TriangleAlert } from "lucide-react";
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
          "flex w-full items-start gap-2.5 rounded-lg py-2 pr-9 pl-2 text-left transition-colors",
          active ? "bg-accent-soft" : "hover:bg-surface-2",
          failed && "cursor-default",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
            active ? "bg-accent text-white dark:text-canvas" : "bg-surface-2 text-ink-2",
            failed && "bg-danger-soft text-danger",
          )}
        >
          {failed ? <CircleAlert className="size-4" /> : <FileText className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "line-clamp-2 text-[13px] leading-snug font-medium",
              active ? "text-accent-ink" : "text-ink",
            )}
          >
            {documentName(doc)}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ink-3">
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
          "absolute top-1.5 right-1.5 flex items-center gap-0.5",
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
            className="h-7 rounded-md bg-danger px-2 text-[12px] font-medium text-white dark:text-canvas"
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
