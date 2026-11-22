"use client";

import { Minus, Plus, ScanSearch, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs, type DocumentProps } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import Button, { IconButton } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import type { Rect, Selection } from "@/lib/types";

// Served from public/pdfjs (copied from node_modules by scripts/copy-pdfjs-assets.mjs).
// Must be set in the same module that renders react-pdf components.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
const PDF_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

type PdfDocument = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
const MAX_FIT_WIDTH = 920;
const PAGE_GAP = 16;
const MAX_SELECTION = 5000;

export interface HighlightTarget {
  documentId: string;
  page: number;
  rects: Rect[];
  /** Changes on every jump, so re-clicking the same card scrolls again. */
  nonce: number;
}

/** Remount with `key={documentId}` when switching documents. */
interface PdfViewerProps {
  documentId: string;
  fileUrl: string;
  highlight: HighlightTarget | null;
  /** Page to show first (e.g. from the outline). */
  goToPage: { page: number; nonce: number } | null;
  onAnalyze: (selection: Selection) => void;
}

interface PendingSelection {
  text: string;
  page: number;
  top: number;
  left: number;
}

export default function PdfViewer({ documentId, fileUrl, highlight, goToPage, onAnalyze }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }>>([]);
  const [visible, setVisible] = useState<Set<number>>(() => new Set([1]));
  const [currentPage, setCurrentPage] = useState(1);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const pageWidth = Math.max(240, Math.min(containerWidth - 48, MAX_FIT_WIDTH) * zoom);
  const numPages = pageSizes.length;

  // -- layout ----------------------------------------------------------------

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onLoadSuccess = useCallback(async (pdf: PdfDocument) => {
    // Measure every page up front so placeholders have the right height and
    // scroll positions are stable before pages render.
    const sizes = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const { width, height } = page.getViewport({ scale: 1 });
        return { w: width, h: height };
      }),
    );
    setPageSizes(sizes);
  }, []);

  // Render only pages near the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.pageNumber);
            if (entry.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        });
      },
      { root, rootMargin: "1200px 0px" },
    );
    pageRefs.current.slice(0, numPages).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // Track the page in the middle of the viewport for the page indicator.
  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const middle = root.scrollTop + root.clientHeight / 3;
    let page = 1;
    pageRefs.current.slice(0, numPages).forEach((el, i) => {
      if (el && el.offsetTop <= middle) page = i + 1;
    });
    setCurrentPage(page);
  }, [numPages]);

  const scrollToPage = useCallback((page: number, offsetFraction = 0, smooth = true) => {
    const root = scrollRef.current;
    const el = pageRefs.current[page - 1];
    if (!root || !el) return;
    const top = el.offsetTop + el.offsetHeight * offsetFraction - 96;
    root.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Jump to a connection (once this document's pages are measured).
  useEffect(() => {
    if (!highlight || highlight.documentId !== documentId || !numPages) return;
    const onPage = highlight.rects.filter((r) => r.page === highlight.page);
    scrollToPage(highlight.page, onPage.length ? Math.min(...onPage.map((r) => r.y0)) : 0);
  }, [highlight, documentId, numPages, scrollToPage]);

  useEffect(() => {
    if (goToPage && numPages) scrollToPage(Math.min(goToPage.page, numPages));
  }, [goToPage, numPages, scrollToPage]);

  // -- selection -------------------------------------------------------------

  const captureSelection = useCallback(() => {
    const root = scrollRef.current;
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!root || !sel || sel.rangeCount === 0 || text.length < 3) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startEl =
      range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const pageEl = startEl?.closest<HTMLElement>("[data-page-number]");
    if (!pageEl || !root.contains(pageEl)) {
      setPending(null);
      return;
    }
    const box = range.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    setPending({
      text: text.slice(0, MAX_SELECTION),
      page: Number(pageEl.dataset.pageNumber),
      top: box.top - rootBox.top + root.scrollTop - 44,
      left: Math.min(
        Math.max(box.left - rootBox.left + box.width / 2, 110),
        rootBox.width - 110,
      ),
    });
  }, []);

  // A drag may end outside the viewer (e.g. over the side panel), so listen
  // for the mouseup on the window and lock selection to PDF text meanwhile.
  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      document.body.classList.add("pdf-selecting");
      const onUp = () => {
        document.body.classList.remove("pdf-selecting");
        captureSelection();
      };
      window.addEventListener("mouseup", onUp, { once: true });
    },
    [captureSelection],
  );

  useEffect(() => () => document.body.classList.remove("pdf-selecting"), []);

  const analyzePending = () => {
    if (!pending) return;
    onAnalyze({ text: pending.text, page: pending.page, documentId });
    setPending(null);
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  // -- zoom ------------------------------------------------------------------

  const zoomBy = (direction: 1 | -1) => {
    setZoom((z) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= z - 0.001);
      const next = ZOOM_STEPS[Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1)];
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3">
        <div className="text-[13px] tabular-nums text-ink-2" aria-live="polite">
          {numPages ? (
            <>
              Page <span className="font-medium text-ink">{currentPage}</span> of {numPages}
            </>
          ) : (
            "Loading…"
          )}
        </div>
        <div className="hidden items-center gap-1.5 text-[12px] text-ink-3 md:flex">
          <ScanSearch className="size-3.5" /> Select text to find connections
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Zoom out" size="sm" onClick={() => zoomBy(-1)} disabled={zoom <= ZOOM_STEPS[0]}>
            <Minus className="size-4" />
          </IconButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="w-12 rounded-md py-1 text-center text-[12px] tabular-nums text-ink-2 hover:bg-surface-2"
            title="Reset zoom (fit width)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            size="sm"
            onClick={() => zoomBy(1)}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          >
            <Plus className="size-4" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onMouseDown={onMouseDown}
        onKeyUp={(e) => e.shiftKey && captureSelection()}
        className="pdf-scroll scroll-thin relative min-h-0 flex-1 overflow-auto bg-viewer"
      >
        <Document
          file={fileUrl}
          options={PDF_OPTIONS}
          suspense={false}
          onLoadSuccess={onLoadSuccess}
          onLoadError={(err) => setLoadError(err.message)}
          loading={
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-2">
              <Spinner /> Opening document…
            </div>
          }
          error={
            <div className="mx-auto mt-16 max-w-sm rounded-lg bg-surface p-5 text-center text-sm text-ink-2 shadow-sm">
              <p className="font-medium text-ink">This PDF could not be displayed.</p>
              {loadError && <p className="mt-1 text-[13px]">{loadError}</p>}
            </div>
          }
          className="flex flex-col items-center py-6"
        >
          {pageSizes.map((size, i) => {
            const page = i + 1;
            const height = (pageWidth * size.h) / size.w;
            const rects =
              highlight && highlight.documentId === documentId
                ? highlight.rects.filter((r) => r.page === page)
                : [];
            return (
              <div
                key={page}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
                data-page-number={page}
                className="relative bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_4px_16px_rgb(0_0_0/0.06)]"
                style={{ width: pageWidth, height, marginBottom: PAGE_GAP }}
              >
                {visible.has(page) && (
                  <Page
                    pageNumber={page}
                    width={pageWidth}
                    loading=""
                    renderAnnotationLayer
                    renderTextLayer
                  />
                )}
                {rects.map((r, j) => (
                  <div
                    key={`${highlight?.nonce}-${j}`}
                    aria-hidden
                    className="pointer-events-none absolute animate-flash rounded-sm mix-blend-multiply"
                    style={{
                      left: `${r.x0 * 100}%`,
                      top: `${r.y0 * 100}%`,
                      width: `${(r.x1 - r.x0) * 100}%`,
                      height: `${(r.y1 - r.y0) * 100}%`,
                      background: "var(--highlight)",
                    }}
                  />
                ))}
              </div>
            );
          })}
        </Document>

        {pending && (
          <div
            className="absolute z-10 flex -translate-x-1/2 animate-fade-in items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-lg"
            style={{ top: Math.max(pending.top, 4), left: pending.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} onClick={analyzePending}>
              Find connections
            </Button>
            <IconButton label="Dismiss" size="sm" onClick={() => setPending(null)}>
              <X className="size-3.5" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
