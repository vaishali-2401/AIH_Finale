"use client";

import { Headphones, Lightbulb, MousePointerClick, Network, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import Tabs from "@/components/ui/Tabs";
import type { useAnalysis } from "@/hooks/useAnalysis";
import type { Connection } from "@/lib/types";
import ConnectionsTab from "./ConnectionsTab";
import InsightsTab from "./InsightsTab";
import PodcastTab from "./PodcastTab";

type Tab = "connections" | "insights" | "podcast";

interface AnalysisPanelProps {
  analysis: ReturnType<typeof useAnalysis>;
  aiEnabled: boolean;
  sourceTitle: string | null;
  activeChunkId: string | null;
  onOpenConnection: (connection: Connection) => void;
}

export default function AnalysisPanel({
  analysis,
  aiEnabled,
  sourceTitle,
  activeChunkId,
  onOpenConnection,
}: AnalysisPanelProps) {
  const { selection, connections, insights, podcast } = analysis;
  const [tab, setTab] = useState<Tab>("connections");
  const [expanded, setExpanded] = useState(false);

  if (!selection) {
    return (
      <EmptyState icon={<MousePointerClick />} title="Select a passage to begin" className="my-auto">
        Highlight any text in the document, then choose <strong className="text-ink">Find connections</strong>{" "}
        to see what the rest of your library says about it.
      </EmptyState>
    );
  }

  const connectionsReady = connections.status === "success";
  const count = connectionsReady ? connections.data.connections.length : null;
  const longQuote = selection.text.length > 220;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-3">
        <figure className="relative rounded-xl bg-surface-2 p-3 pr-9">
          <blockquote
            className={`font-serif text-[13.5px] leading-relaxed text-ink ${expanded ? "" : "line-clamp-4"}`}
          >
            “{selection.text}”
          </blockquote>
          <figcaption className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-3">
            <span className="truncate">
              {sourceTitle ?? "Selected text"} · p. {selection.page}
            </span>
            {longQuote && (
              <button
                type="button"
                className="shrink-0 font-medium text-accent hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : "Show all"}
              </button>
            )}
          </figcaption>
          <IconButton label="Clear selection" size="sm" className="absolute top-1.5 right-1.5" onClick={analysis.clear}>
            <X className="size-3.5" />
          </IconButton>
        </figure>

        <Tabs
          idPrefix="analysis"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "connections",
              label: "Connections",
              icon: <Network className="size-3.5" />,
              badge:
                connections.status === "loading" ? (
                  <Spinner className="size-3" />
                ) : count !== null ? (
                  <span className="rounded-full bg-surface-3 px-1.5 text-[10.5px] tabular-nums">{count}</span>
                ) : null,
            },
            { id: "insights", label: "Insights", icon: <Lightbulb className="size-3.5" /> },
            { id: "podcast", label: "Podcast", icon: <Headphones className="size-3.5" /> },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`analysis-panel-${tab}`}
        aria-labelledby={`analysis-tab-${tab}`}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3"
      >
        {tab === "connections" && (
          <ConnectionsTab
            state={connections}
            activeChunkId={activeChunkId}
            onOpen={onOpenConnection}
            onRetry={() => analysis.analyze(selection)}
          />
        )}
        {tab === "insights" && (
          <InsightsTab
            state={insights}
            aiEnabled={aiEnabled}
            connectionsReady={connectionsReady}
            onGenerate={analysis.loadInsights}
          />
        )}
        {tab === "podcast" && (
          <PodcastTab state={podcast} connectionsReady={connectionsReady} onGenerate={analysis.loadPodcast} />
        )}
      </div>
    </div>
  );
}
