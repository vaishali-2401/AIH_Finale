import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import Button from "@/components/ui/Button";
import { Notice } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Spinner";
import type { AsyncState } from "@/hooks/useAnalysis";
import type { Insights } from "@/lib/types";

interface InsightsTabProps {
  state: AsyncState<Insights>;
  aiEnabled: boolean;
  connectionsReady: boolean;
  onGenerate: () => void;
}

export default function InsightsTab({ state, aiEnabled, connectionsReady, onGenerate }: InsightsTabProps) {
  if (!aiEnabled) {
    return (
      <Notice tone="warning">
        Insights need Gemini. Add <code className="font-mono">GEMINI_API_KEY</code> to{" "}
        <code className="font-mono">backend/.env</code> and restart the backend.
      </Notice>
    );
  }

  if (state.status === "idle") {
    return (
      <div className="py-2">
        <p className="font-serif text-[17px] leading-snug text-ink">Go deeper on this passage.</p>
        <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-2">
          Key takeaways, contradictions and lesser-known facts, drawn only from the connected passages.
        </p>
        <Button className="mt-4" variant="primary" onClick={onGenerate} disabled={!connectionsReady}>
          Write insights
        </Button>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Generating insights">
        <Skeleton className="h-16 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-3" />
        ))}
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Notice
        tone="error"
        action={
          <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={onGenerate}>
            Try again
          </Button>
        }
      >
        {state.error}
      </Notice>
    );
  }

  const insights = state.data;
  return (
    <div className="animate-fade-in space-y-6">
      <p className="font-serif text-[15.5px] leading-relaxed text-ink">{insights.summary}</p>

      <Section title="Key takeaways" show={insights.key_takeaways.length > 0}>
        <ol className="space-y-2">
          {insights.key_takeaways.map((t, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] leading-snug text-ink">
              <span className="w-4 shrink-0 font-mono text-[11px] leading-5 text-ink-3">{i + 1}.</span>
              {t}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Contradictions" show={insights.contradictions.length > 0}>
        <ul className="space-y-3">
          {insights.contradictions.map((c, i) => (
            <li key={i} className="border-l-2 border-ink pl-3 text-[13.5px] leading-snug">
              <p className="font-semibold text-ink">{c.statement}</p>
              <p className="mt-1 text-ink-2">{c.explanation}</p>
              <p className="mt-1.5 font-mono text-[11px] text-ink-3">{c.source}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Examples" show={insights.examples.length > 0}>
        <ul className="space-y-2">
          {insights.examples.map((e, i) => (
            <li key={i} className="font-serif text-[14px] leading-snug text-ink-2 italic">
              {e}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Did you know" show={insights.did_you_know.length > 0}>
        <ul className="space-y-2">
          {insights.did_you_know.map((f, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] leading-snug text-ink">
              <span className="shrink-0 text-ink-3" aria-hidden>
                —
              </span>
              {f}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, show, children }: { title: string; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <section className="border-t border-line pt-3">
      <h3 className="label mb-3 text-ink-3">{title}</h3>
      {children}
    </section>
  );
}
