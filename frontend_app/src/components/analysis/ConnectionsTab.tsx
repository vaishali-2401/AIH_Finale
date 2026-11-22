import { Network, RotateCw } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState, { Notice } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Spinner";
import type { AsyncState } from "@/hooks/useAnalysis";
import type { Connection, ConnectionsResponse } from "@/lib/types";
import ConnectionCard from "./ConnectionCard";

interface ConnectionsTabProps {
  state: AsyncState<ConnectionsResponse>;
  activeChunkId: string | null;
  onOpen: (connection: Connection) => void;
  onRetry: () => void;
}

export default function ConnectionsTab({ state, activeChunkId, onOpen, onRetry }: ConnectionsTabProps) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Finding connections">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2.5 border-b border-line py-4 pl-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Notice
        tone="error"
        action={
          <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {state.error}
      </Notice>
    );
  }

  const { connections, mode, reranked, warning } = state.data;
  return (
    <div className="space-y-3">
      {warning && <Notice tone="warning">{warning}</Notice>}
      {connections.length ? (
        <>
          <p className="label text-ink-3">
            {connections.length} {connections.length === 1 ? "passage" : "passages"} ·{" "}
            {reranked ? "ranked by AI" : mode === "semantic" ? "semantic matches" : "keyword matches"}
          </p>
          <ul className="-mx-4 border-t border-line">
            {connections.map((c) => (
              <ConnectionCard
                key={c.chunk_id}
                connection={c}
                active={c.chunk_id === activeChunkId}
                showScore={reranked}
                onOpen={() => onOpen(c)}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon={<Network />} title="No related passages found">
          Nothing else in your library discusses this. Try a longer selection, or add more documents on the
          topic.
        </EmptyState>
      )}
    </div>
  );
}
