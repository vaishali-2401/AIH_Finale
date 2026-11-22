import { ListTree } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Spinner";
import { cn } from "@/lib/format";
import type { OutlineItem } from "@/lib/types";

interface OutlineListProps {
  outline: OutlineItem[] | null; // null while loading
  hasDocument: boolean;
  onSelect: (page: number) => void;
}

const indent: Record<string, string> = { H1: "pl-4", H2: "pl-7", H3: "pl-10" };

export default function OutlineList({ outline, hasDocument, onSelect }: OutlineListProps) {
  if (!hasDocument) {
    return (
      <EmptyState icon={<ListTree />} title="No document open">
        Open a document to see its sections.
      </EmptyState>
    );
  }
  if (outline === null) {
    return (
      <div className="space-y-2.5 p-4">
        {[80, 60, 70, 50].map((w) => (
          <Skeleton key={w} className="h-3" />
        ))}
      </div>
    );
  }
  if (!outline.length) {
    return (
      <EmptyState icon={<ListTree />} title="No sections detected">
        This document has no headings or bookmarks.
      </EmptyState>
    );
  }
  return (
    <nav aria-label="Document outline">
      <ul className="py-2">
        {outline.map((item, i) => (
          <li key={`${item.page}-${i}`}>
            <button
              type="button"
              onClick={() => onSelect(item.page)}
              className={cn(
                "flex w-full items-baseline gap-2 py-1.5 pr-4 text-left text-[13px] leading-snug hover:bg-surface-2",
                indent[item.level] ?? "pl-8",
                item.level === "H1" ? "font-serif text-[14.5px] text-ink" : "text-ink-2",
              )}
            >
              <span className="min-w-0 flex-1">{item.title}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{item.page}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
