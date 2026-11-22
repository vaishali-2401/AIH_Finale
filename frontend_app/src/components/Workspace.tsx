"use client";

import { FilePlus2, Network, Sparkles, Upload, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import AnalysisPanel from "@/components/analysis/AnalysisPanel";
import AppHeader from "@/components/AppHeader";
import LibraryPanel from "@/components/library/LibraryPanel";
import { Notice } from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import type { HighlightTarget } from "@/components/viewer/PdfViewer";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useDocuments } from "@/hooks/useDocuments";
import { useHealth } from "@/hooks/useHealth";
import { api, errorText } from "@/lib/api";
import { cn, documentName } from "@/lib/format";
import type { Connection, OutlineItem, Selection, UploadResult } from "@/lib/types";

// PDF.js needs browser APIs, so the viewer is only loaded on the client.
const PdfViewer = dynamic(() => import("@/components/viewer/PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 bg-viewer text-sm text-ink-2">
      <Spinner /> Loading viewer…
    </div>
  ),
});

export default function Workspace() {
  return (
    <ToastProvider>
      <WorkspaceInner />
    </ToastProvider>
  );
}

function WorkspaceInner() {
  const toast = useToast();
  const { health, online } = useHealth();
  const library = useDocuments();
  const analysis = useAnalysis();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [highlight, setHighlight] = useState<HighlightTarget | null>(null);
  const [goToPage, setGoToPage] = useState<{ page: number; nonce: number } | null>(null);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const activeDoc = library.documents.find((d) => d.id === activeId) ?? null;
  const activeStatus = activeDoc?.status;

  // -- documents -------------------------------------------------------------

  const openDocument = useCallback((id: string) => {
    setActiveId(id);
    setOutline(null);
    setGoToPage(null);
    setLibraryOpen(false);
  }, []);

  // Load the outline once the open document has finished processing.
  useEffect(() => {
    if (!activeId || activeStatus !== "ready") return;
    let cancelled = false;
    api
      .getDocument(activeId)
      .then((detail) => !cancelled && setOutline(detail.outline))
      .catch(() => !cancelled && setOutline([]));
    return () => {
      cancelled = true;
    };
  }, [activeId, activeStatus]);

  // Close the viewer if the open document was deleted.
  useEffect(() => {
    if (activeId && !library.loading && !activeDoc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(null);
    }
  }, [activeId, activeDoc, library.loading]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
      if (!pdfs.length) {
        toast.show("Only PDF files can be added.", "error");
        return;
      }
      let results: UploadResult[];
      try {
        results = await library.upload(pdfs);
      } catch (err) {
        toast.show(errorText(err), "error");
        return;
      }
      const added = results.filter((r) => r.document && !r.duplicate);
      const duplicates = results.filter((r) => r.duplicate);
      const failed = results.filter((r) => r.error);
      if (added.length) {
        toast.show(
          `${added.length} ${added.length === 1 ? "document" : "documents"} added. Indexing in the background…`,
          "success",
        );
      }
      if (duplicates.length) {
        toast.show(`${duplicates.map((r) => r.filename).join(", ")} ${duplicates.length === 1 ? "is" : "are"} already in your library.`);
      }
      failed.forEach((r) => toast.show(`${r.filename}: ${r.error}`, "error"));
      const first = added[0]?.document ?? duplicates[0]?.document;
      if (first && !activeId) openDocument(first.id);
    },
    [library, toast, activeId, openDocument],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await library.remove(id);
        if (analysis.selection?.documentId === id) analysis.clear();
        toast.show("Document deleted.");
      } catch (err) {
        toast.show(errorText(err), "error");
      }
    },
    [library, analysis, toast],
  );

  const handleRetry = useCallback(
    (id: string) => {
      library.reindex(id).catch((err) => toast.show(errorText(err), "error"));
    },
    [library, toast],
  );

  // -- analysis --------------------------------------------------------------

  const handleAnalyze = useCallback(
    (selection: Selection) => {
      setActiveChunkId(null);
      setHighlight(null);
      setAnalysisOpen(true);
      void analysis.analyze(selection);
    },
    [analysis],
  );

  const handleOpenConnection = useCallback(
    (connection: Connection) => {
      setActiveChunkId(connection.chunk_id);
      if (connection.document_id !== activeId) openDocument(connection.document_id);
      setHighlight({
        documentId: connection.document_id,
        page: connection.page,
        rects: connection.rects,
        nonce: Date.now(),
      });
      // On narrow screens, reveal the viewer so the jump is visible.
      if (window.matchMedia("(max-width: 1279px)").matches) setAnalysisOpen(false);
    },
    [activeId, openDocument],
  );

  // -- drag & drop anywhere ----------------------------------------------------

  const dragDepth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void handleUpload(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleUpload]);

  const selectionDoc = library.documents.find((d) => d.id === analysis.selection?.documentId);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        title={activeDoc ? documentName(activeDoc) : null}
        health={health}
        online={online}
        onToggleLibrary={() => setLibraryOpen((v) => !v)}
        onToggleAnalysis={() => setAnalysisOpen((v) => !v)}
        analysisAvailable={analysis.selection !== null}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Backdrop for the drawers on small screens */}
        {(libraryOpen || analysisOpen) && (
          <button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 z-20 animate-fade-in bg-black/30 xl:hidden"
            onClick={() => {
              setLibraryOpen(false);
              setAnalysisOpen(false);
            }}
          />
        )}

        <aside
          aria-label="Library"
          className={cn(
            "z-30 w-72 shrink-0 border-r border-line bg-surface transition-transform",
            "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl",
            libraryOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
          )}
        >
          <LibraryPanel
            documents={library.documents}
            loading={library.loading}
            error={library.error}
            uploading={library.uploading}
            activeId={activeId}
            outline={activeDoc?.status === "failed" ? [] : activeDoc?.status === "ready" ? outline : null}
            onUpload={handleUpload}
            onOpen={openDocument}
            onDelete={handleDelete}
            onRetry={handleRetry}
            onOutlineClick={(page) => {
              setGoToPage({ page, nonce: Date.now() });
              setLibraryOpen(false);
            }}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {online === false && (
            <div className="border-b border-line bg-surface p-2">
              <Notice tone="error">
                <span className="inline-flex items-center gap-1.5">
                  <WifiOff className="size-3.5" /> Can&apos;t reach the backend. Start it with{" "}
                  <code className="font-mono">python -m app</code> in <code className="font-mono">backend/</code>.
                </span>
              </Notice>
            </div>
          )}
          {activeDoc ? (
            <PdfViewer
              key={activeDoc.id}
              documentId={activeDoc.id}
              fileUrl={api.fileUrl(activeDoc.id)}
              highlight={highlight}
              goToPage={goToPage}
              onAnalyze={handleAnalyze}
            />
          ) : (
            <Welcome
              hasDocuments={library.documents.length > 0}
              uploading={library.uploading}
              onUpload={handleUpload}
              onBrowse={() => setLibraryOpen(true)}
            />
          )}
        </main>

        <aside
          aria-label="Connections"
          className={cn(
            "z-30 flex w-95 shrink-0 flex-col border-l border-line bg-surface transition-transform",
            "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:max-w-[92vw] max-xl:shadow-xl",
            analysisOpen ? "max-xl:translate-x-0" : "max-xl:translate-x-full",
          )}
        >
          <AnalysisPanel
            analysis={analysis}
            aiEnabled={health?.ai_enabled ?? false}
            sourceTitle={selectionDoc ? documentName(selectionDoc) : null}
            activeChunkId={activeChunkId}
            onOpenConnection={handleOpenConnection}
          />
        </aside>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-accent/10 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface px-12 py-10 shadow-xl">
            <Upload className="size-8 text-accent" />
            <p className="text-base font-semibold text-ink">Drop PDFs to add them to your library</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Welcome({
  hasDocuments,
  uploading,
  onUpload,
  onBrowse,
}: {
  hasDocuments: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => void;
  onBrowse: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const steps = [
    { icon: FilePlus2, title: "Add your PDFs", text: "Reports, papers, guides: anything on related topics." },
    { icon: Sparkles, title: "Select a passage", text: "Highlight text while you read and ask for connections." },
    { icon: Network, title: "See how it connects", text: "Supporting points, contradictions and examples across documents." },
  ];

  return (
    <div className="scroll-thin flex flex-1 items-center justify-center overflow-y-auto bg-canvas p-6">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Connect ideas across your PDFs
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2">
          Read any document and instantly find where the rest of your library agrees, disagrees or adds
          detail.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="group mt-8 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-6 py-10 transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-60"
        >
          {uploading ? (
            <Spinner className="size-7 text-accent" />
          ) : (
            <Upload className="size-7 text-ink-3 transition-colors group-hover:text-accent" />
          )}
          <span className="text-sm font-medium text-ink">
            {uploading ? "Uploading…" : "Drop PDFs here or click to browse"}
          </span>
          <span className="text-[12.5px] text-ink-3">Up to 30 files at a time, 50 MB each</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onUpload(files);
            e.target.value = "";
          }}
        />
        {hasDocuments && (
          <p className="mt-4 text-[13px] text-ink-2">
            or{" "}
            <button type="button" onClick={onBrowse} className="font-medium text-accent hover:underline lg:hidden">
              open a document from your library
            </button>
            <span className="max-lg:hidden">open a document from your library on the left</span>
          </p>
        )}

        <ol className="mt-10 grid gap-4 text-left sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <Icon className="size-4 text-ink-3" aria-hidden />
              </div>
              <p className="mt-3 text-[13.5px] font-medium text-ink">{title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
