import { CircleCheck, Lightbulb, Link2, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/format";
import type { Connection, Relation } from "@/lib/types";

export const RELATIONS: Record<Relation, { label: string; icon: LucideIcon; className: string }> = {
  supports: { label: "Supports", icon: CircleCheck, className: "bg-supports-soft text-supports" },
  contradicts: { label: "Contradicts", icon: TriangleAlert, className: "bg-contradicts-soft text-contradicts" },
  example: { label: "Example", icon: Lightbulb, className: "bg-example-soft text-example" },
  related: { label: "Related", icon: Link2, className: "bg-related-soft text-related" },
};

export function RelationBadge({ relation }: { relation: Relation }) {
  const { label, icon: Icon, className } = RELATIONS[relation];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

interface ConnectionCardProps {
  connection: Connection;
  active: boolean;
  showScore: boolean;
  onOpen: () => void;
}

export default function ConnectionCard({ connection: c, active, showScore, onOpen }: ConnectionCardProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "w-full animate-slide-up rounded-xl border bg-surface p-3.5 text-left transition-all",
          "hover:border-line-strong hover:shadow-sm",
          active ? "border-accent ring-2 ring-accent/20" : "border-line",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <RelationBadge relation={c.relation} />
          {showScore && (
            <span className="text-[11px] tabular-nums text-ink-3" title="Relevance">
              {Math.round(c.score * 100)}%
            </span>
          )}
        </div>

        {c.reason && <p className="mt-2.5 text-[13px] leading-snug font-medium text-ink">{c.reason}</p>}

        <blockquote className="mt-2 line-clamp-4 border-l-2 border-line pl-2.5 font-serif text-[13px] leading-relaxed text-ink-2">
          {c.snippet}
        </blockquote>

        <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <span className="min-w-0 truncate font-medium text-ink-2">{c.document_title}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">p. {c.page}</span>
          {c.section && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{c.section}</span>
            </>
          )}
        </div>
      </button>
    </li>
  );
}
