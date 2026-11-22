"use client";

import { MousePointerClick, X } from "lucide-react";
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
      <EmptyState icon={<MousePointerClick />} title="Select a passage to begin." className="mt-10">
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
      <div className="space-y-4 px-4 pt-4">
        <figure className="relative pr-8">
          <p className="label mb-2 text-ink-3">You selected</p>
          <blockquote
            className={`border-l-2 border-ink pl-3 font-serif text-[15px] leading-relaxed text-ink ${expanded ? "" : "line-clamp-4"}`}
          >
            {selection.text}
          </blockquote>
          <figcaption className="mt-2 flex items-baseline gap-2 pl-3.5 text-[12px] text-ink-3">
            <span className="truncate">{sourceTitle ?? "Selected text"}</span>
            <span className="shrink-0 font-mono text-[11px]">p.{selection.page}</span>
            {longQuote && (
              <button
                type="button"
                className="ml-auto shrink-0 text-ink underline underline-offset-2"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Less" : "More"}
              </button>
            )}
          </figcaption>
          <IconButton label="Clear selection" size="sm" className="absolute top-0 -right-1" onClick={analysis.clear}>
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
              
              badge:
                connections.status === "loading" ? (
                  <Spinner className="size-3" />
                ) : count !== null ? (
                  <span className="font-mono text-[11px] font-normal text-ink-3 tabular-nums">{count}</span>
                ) : null,
            },
            { id: "insights", label: "Insights" },
            { id: "podcast", label: "Podcast" },
          ]}
        />
      </div>

      <div
        role="tabpanel"
        id={`analysis-panel-${tab}`}
        aria-labelledby={`analysis-tab-${tab}`}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4"
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
