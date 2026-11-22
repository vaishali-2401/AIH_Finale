"use client";

import { Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/format";
import type { Health } from "@/lib/types";

interface AppHeaderProps {
  title: string | null;
  health: Health | null;
  online: boolean | null;
  onToggleLibrary: () => void;
  onToggleAnalysis: () => void;
  analysisAvailable: boolean;
}

export default function AppHeader({
  title,
  health,
  online,
  onToggleLibrary,
  onToggleAnalysis,
  analysisAvailable,
}: AppHeaderProps) {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-ink bg-surface px-3 sm:px-4">
      <IconButton label="Toggle library" className="lg:hidden" onClick={onToggleLibrary}>
        <PanelLeft className="size-4.5" />
      </IconButton>

      <div className="flex min-w-0 items-center gap-2.5">
        <Mark />
        <span className="font-serif text-[19px] leading-none tracking-tight text-ink">
          Connecting the Dots
        </span>
      </div>

      {title && (
        <div className="hidden min-w-0 flex-1 items-center justify-center border-l border-line pl-3 md:flex">
          <span className="truncate text-[13px] text-ink-2">{title}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Status health={health} online={online} />
        <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
        <IconButton
          label="Toggle connections panel"
          className="xl:hidden"
          onClick={onToggleAnalysis}
          disabled={!analysisAvailable}
        >
          <PanelRight className="size-4.5" />
        </IconButton>
      </div>
    </header>
  );
}

function Status({ health, online }: { health: Health | null; online: boolean | null }) {
  if (online === null) return null;
  const [label, detail, dot] = !online
    ? ["Offline", "Can't reach the backend server.", "bg-danger"]
    : health?.ai_enabled
      ? [
          health.model ?? "Gemini",
          `AI on. Voices: ${health.tts === "gemini" ? "Gemini" : "browser"}.`,
          "bg-ink",
        ]
      : ["Keyword mode", "No Gemini API key: keyword search and browser voices only.", "border border-ink"];
  return (
    <span title={detail} className="mr-1 hidden items-center gap-1.5 font-mono text-[11px] text-ink-2 sm:inline-flex">
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {label}
      <span className="sr-only">: {detail}</span>
    </span>
  );
}

/** Three dots joined by a line: the "connecting the dots" idea, drawn plainly. */
function Mark() {
  return (
    <svg viewBox="0 0 28 16" className="h-4 w-7 shrink-0 text-ink" aria-hidden>
      <path d="M3 12 L14 4 L25 12" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="3" cy="12" r="2.5" fill="currentColor" />
      <circle cx="14" cy="4" r="2.5" fill="currentColor" />
      <circle cx="25" cy="12" r="2.5" fill="var(--canvas)" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
