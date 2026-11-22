"use client";

import { BookOpen, FilePlus2, Library, Search } from "lucide-react";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Spinner";
import Tabs from "@/components/ui/Tabs";
import { documentName } from "@/lib/format";
import type { DocumentInfo, OutlineItem } from "@/lib/types";
import DocumentItem from "./DocumentItem";
import OutlineList from "./OutlineList";

interface LibraryPanelProps {
  documents: DocumentInfo[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  activeId: string | null;
  outline: OutlineItem[] | null;
  onUpload: (files: File[]) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onRetry: (id: string) => void;
  onOutlineClick: (page: number) => void;
}

type Tab = "library" | "outline";

export default function LibraryPanel(props: LibraryPanelProps) {
  const { documents, loading, error, uploading, activeId, outline, onUpload } = props;
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? documents.filter((d) => `${documentName(d)} ${d.filename}`.toLowerCase().includes(q))
    : documents;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 px-4 pt-4">
        <Button
          variant="primary"
          className="w-full"
          icon={<FilePlus2 className="size-4" />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Add PDFs"}
        </Button>
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
        <Tabs
          idPrefix="left"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "library", label: "Library" },
            { id: "outline", label: "Outline" },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`left-panel-${tab}`}
        aria-labelledby={`left-tab-${tab}`}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto"
      >
        {tab === "library" ? (
          <>
            {documents.length > 4 && (
              <div className="relative px-4 pt-3 pb-1">
                <Search className="pointer-events-none absolute top-1/2 left-4 mt-1 size-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter documents"
                  aria-label="Filter documents"
                  className="h-8 w-full border-0 border-b border-line bg-transparent pr-2 pl-6 text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                />
              </div>
            )}
            {loading ? (
              <div className="space-y-3 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3 border-b border-line py-3 pl-1">
                    
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && !documents.length ? (
              <EmptyState icon={<Library />} title="Library unavailable">
                {error}
              </EmptyState>
            ) : !documents.length ? (
              <EmptyState icon={<BookOpen />} title="No documents yet">
                Add a few related PDFs (or drop them anywhere on the page) to start connecting ideas.
              </EmptyState>
            ) : (
              <ul className="border-t border-line">
                {filtered.map((doc) => (
                  <DocumentItem
                    key={doc.id}
                    doc={doc}
                    active={doc.id === activeId}
                    onOpen={() => props.onOpen(doc.id)}
                    onDelete={() => props.onDelete(doc.id)}
                    onRetry={() => props.onRetry(doc.id)}
                  />
                ))}
                {!filtered.length && (
                  <li className="px-3 py-6 text-center text-[13px] text-ink-3">No documents match “{query}”.</li>
                )}
              </ul>
            )}
          </>
        ) : (
          <OutlineList outline={outline} hasDocument={activeId !== null} onSelect={props.onOutlineClick} />
        )}
      </div>
    </div>
  );
}
