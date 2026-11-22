import { Lightbulb, ListChecks, Quote, RotateCw, Sparkles, TriangleAlert } from "lucide-react";
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
      <div className="rounded-xl border border-dashed border-line-strong p-5 text-center">
        <p className="text-sm font-medium text-ink">Go deeper on this passage</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-2">
          Key takeaways, contradictions and surprising facts drawn from the connected passages.
        </p>
        <Button
          className="mt-4"
          variant="primary"
          icon={<Sparkles className="size-4" />}
          onClick={onGenerate}
          disabled={!connectionsReady}
        >
          Generate insights
        </Button>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Generating insights">
        <Skeleton className="h-16 w-full rounded-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-3" />
        ))}
        <Skeleton className="h-20 w-full rounded-xl" />
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
    <div className="animate-fade-in space-y-5">
      <p className="rounded-xl bg-accent-soft p-3.5 text-[13.5px] leading-relaxed text-ink">{insights.summary}</p>

      <Section icon={<ListChecks />} title="Key takeaways" show={insights.key_takeaways.length > 0}>
        <ul className="space-y-2">
          {insights.key_takeaways.map((t, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<TriangleAlert />} title="Contradictions" show={insights.contradictions.length > 0}>
        <ul className="space-y-2">
          {insights.contradictions.map((c, i) => (
            <li key={i} className="rounded-lg bg-contradicts-soft p-3 text-[13px] leading-snug">
              <p className="font-medium text-ink">{c.statement}</p>
              <p className="mt-1 text-ink-2">{c.explanation}</p>
              <p className="mt-1.5 text-[11.5px] font-medium text-contradicts">{c.source}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<Quote />} title="Examples" show={insights.examples.length > 0}>
        <ul className="space-y-1.5">
          {insights.examples.map((e, i) => (
            <li key={i} className="border-l-2 border-example pl-2.5 text-[13px] leading-snug text-ink-2">
              {e}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<Lightbulb />} title="Did you know?" show={insights.did_you_know.length > 0}>
        <ul className="space-y-2">
          {insights.did_you_know.map((f, i) => (
            <li key={i} className="rounded-lg bg-example-soft p-3 text-[13px] leading-snug text-ink">
              {f}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  show,
  children,
}: {
  icon: ReactNode;
  title: string;
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return null;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wider text-ink-3 uppercase [&>svg]:size-3.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
