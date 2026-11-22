import { cn } from "@/lib/format";
import type { Connection, Relation } from "@/lib/types";

/** Relations are distinguished typographically rather than by colour:
 *  contradictions are inverted (the one you most need to notice), supporting
 *  passages are outlined, examples dashed, and plain relations unadorned. */
export const RELATIONS: Record<Relation, { label: string; className: string }> = {
  contradicts: { label: "Contradicts", className: "bg-ink text-canvas border border-ink" },
  supports: { label: "Supports", className: "border border-ink text-ink" },
  example: { label: "Example", className: "border border-dashed border-ink text-ink" },
  related: { label: "Related", className: "border border-transparent px-0 text-ink-3" },
};

export function RelationBadge({ relation }: { relation: Relation }) {
  const { label, className } = RELATIONS[relation];
  return <span className={cn("label inline-block px-1.5 py-px leading-4", className)}>{label}</span>;
}

interface ConnectionCardProps {
  connection: Connection;
  active: boolean;
  showScore: boolean;
  onOpen: () => void;
}

export default function ConnectionCard({ connection: c, active, showScore, onOpen }: ConnectionCardProps) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group relative w-full py-4 pr-4 pl-4 text-left transition-colors hover:bg-surface-2",
          active && "bg-surface-2",
        )}
      >
        {/* Active marker: a solid rule in the margin */}
        <span
          aria-hidden
          className={cn("absolute inset-y-3 left-0 w-0.5", active ? "bg-ink" : "bg-transparent")}
        />
        <div className="flex items-center justify-between gap-2">
          <RelationBadge relation={c.relation} />
          {showScore && (
            <span className="label text-ink-3" title="Relevance">
              {Math.round(c.score * 100)}
            </span>
          )}
        </div>

        {c.reason && <p className="mt-2.5 text-[13.5px] leading-snug text-ink">{c.reason}</p>}

        <blockquote className="mt-2 line-clamp-4 font-serif text-[14px] leading-relaxed text-ink-2 italic">
          {c.snippet}
        </blockquote>

        <p className="mt-2.5 flex items-baseline gap-1.5 text-[12px] text-ink-3">
          <span className="min-w-0 truncate text-ink-2 underline decoration-line underline-offset-2 group-hover:decoration-ink">
            {c.document_title}
          </span>
          <span className="shrink-0 font-mono text-[11px]">p.{c.page}</span>
        </p>
      </button>
    </li>
  );
}
