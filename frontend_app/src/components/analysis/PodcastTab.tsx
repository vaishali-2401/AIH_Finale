"use client";

import { Headphones, Pause, Play, RotateCw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Notice } from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import type { AsyncState } from "@/hooks/useAnalysis";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { speakScript, speechSupported, type SpeechPlayback } from "@/lib/speech";
import type { Podcast } from "@/lib/types";

interface PodcastTabProps {
  state: AsyncState<Podcast>;
  connectionsReady: boolean;
  onGenerate: () => void;
}

export default function PodcastTab({ state, connectionsReady, onGenerate }: PodcastTabProps) {
  if (state.status === "idle") {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-5 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Headphones className="size-5" />
        </div>
        <p className="text-sm font-medium text-ink">Listen to the connections</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-ink-2">
          A short two-host conversation about this passage and what your other documents say about it.
        </p>
        <Button
          className="mt-4"
          variant="primary"
          icon={<Headphones className="size-4" />}
          onClick={onGenerate}
          disabled={!connectionsReady}
        >
          Create episode
        </Button>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-ink-2" aria-busy="true">
        <Spinner className="size-5 text-accent" />
        Writing and recording your episode… this can take up to a minute.
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

  return <PodcastPlayer podcast={state.data} onRegenerate={onGenerate} />;
}

function PodcastPlayer({ podcast, onRegenerate }: { podcast: Podcast; onRegenerate: () => void }) {
  const useBrowser = podcast.tts === "browser" || !podcast.audio_url;
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [status, setStatus] = useState<"stopped" | "playing" | "paused">("stopped");
  const playback = useRef<SpeechPlayback | null>(null);

  // Stop browser speech when the episode changes or the panel unmounts.
  useEffect(() => () => playback.current?.stop(), [podcast]);

  const play = async () => {
    if (status === "paused" && playback.current) {
      playback.current.resume();
      setStatus("playing");
      return;
    }
    setStatus("playing");
    playback.current = await speakScript(podcast.lines, {
      onLine: setActiveLine,
      onEnd: () => {
        setStatus("stopped");
        setActiveLine(null);
      },
    });
  };

  const pause = () => {
    playback.current?.pause();
    setStatus("paused");
  };

  const stop = () => {
    playback.current?.stop();
    playback.current = null;
    setStatus("stopped");
    setActiveLine(null);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Episode</p>
            <h3 className="mt-0.5 text-[15px] leading-snug font-semibold text-ink">{podcast.title}</h3>
          </div>
          <Button size="sm" variant="ghost" icon={<RotateCw className="size-3.5" />} onClick={onRegenerate}>
            New take
          </Button>
        </div>

        <div className="mt-3">
          {useBrowser ? (
            speechSupported() ? (
              <div className="flex items-center gap-2">
                {status === "playing" ? (
                  <Button variant="primary" icon={<Pause className="size-4" />} onClick={pause}>
                    Pause
                  </Button>
                ) : (
                  <Button variant="primary" icon={<Play className="size-4" />} onClick={play}>
                    {status === "paused" ? "Resume" : "Play"}
                  </Button>
                )}
                <Button icon={<Square className="size-3.5" />} onClick={stop} disabled={status === "stopped"}>
                  Stop
                </Button>
              </div>
            ) : (
              <Notice tone="warning">This browser can&apos;t read text aloud. The transcript is below.</Notice>
            )
          ) : (
            // No <track>: the full transcript is rendered below the player.
            <audio controls src={api.audioUrl(podcast.audio_url!)} className="w-full" />
          )}
        </div>

        <p className="mt-2.5 text-[11.5px] text-ink-3">
          {useBrowser ? "Read by your browser's built-in voice" : "Voiced by Gemini"} ·{" "}
          {podcast.generated_by === "ai" ? "script written by Gemini" : "simple script (AI unavailable)"}
        </p>
        {podcast.tts_error && (
          <p className="mt-1 text-[11.5px] text-warning" title={podcast.tts_error}>
            Gemini voices were unavailable, so your browser is reading it instead.
          </p>
        )}
      </div>

      <ol className="space-y-2.5" aria-label="Transcript">
        {podcast.lines.map((line, i) => (
          <li
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-[13px] leading-relaxed transition-colors",
              activeLine === i ? "bg-accent-soft" : "bg-transparent",
            )}
          >
            <span
              className={cn(
                "mr-1.5 text-[11.5px] font-semibold tracking-wide uppercase",
                line.speaker === podcast.lines[0].speaker ? "text-accent" : "text-example",
              )}
            >
              {line.speaker}
            </span>
            <span className="text-ink">{line.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
