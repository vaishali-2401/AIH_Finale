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
      <div className="py-2">
        <p className="font-serif text-[17px] leading-snug text-ink">Listen instead of reading.</p>
        <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-2">
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
      <div className="flex items-start gap-3 py-6 text-[13px] leading-relaxed text-ink-2" aria-busy="true">
        <Spinner className="mt-0.5 size-4 shrink-0 text-ink" />
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
    <div className="animate-fade-in space-y-5">
      <div className="border-b border-ink pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label text-ink-3">Episode</p>
            <h3 className="mt-1 font-serif text-[19px] leading-snug text-ink">{podcast.title}</h3>
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

        <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-3">
          {useBrowser ? "Read by your browser's built-in voice" : "Voiced by Gemini"} ·{" "}
          {podcast.generated_by === "ai" ? "script written by Gemini" : "simple script (AI unavailable)"}
        </p>
        {podcast.tts_error && (
          <p className="mt-1 font-mono text-[11px] text-ink-2" title={podcast.tts_error}>
            Gemini voices were unavailable, so your browser is reading it instead.
          </p>
        )}
      </div>

      {/* Set like a script: speaker in the margin, line beside it. */}
      <ol className="space-y-3" aria-label="Transcript">
        {podcast.lines.map((line, i) => (
          <li
            key={i}
            className={cn(
              "grid grid-cols-[4.5rem_1fr] gap-2 border-l-2 py-0.5 pl-2.5 text-[13.5px] leading-relaxed transition-colors",
              activeLine === i ? "border-ink" : "border-transparent",
            )}
          >
            <span
              className={cn(
                "label pt-1",
                line.speaker === podcast.lines[0].speaker ? "text-ink" : "text-ink-3",
              )}
            >
              {line.speaker}
            </span>
            <span className="font-serif text-ink">{line.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
