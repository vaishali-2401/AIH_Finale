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
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
      <IconButton label="Toggle library" className="lg:hidden" onClick={onToggleLibrary}>
        <PanelLeft className="size-4.5" />
      </IconButton>

      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">
          Connecting the Dots
        </span>
      </div>

      {title && (
        <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
          <span className="truncate text-[13px] text-ink-2">{title}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <StatusPill health={health} online={online} />
        <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
          {theme === "dark" ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
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

function StatusPill({ health, online }: { health: Health | null; online: boolean | null }) {
  if (online === null) return null;
  const [label, detail, dot] = !online
    ? ["Offline", "Can't reach the backend server.", "bg-danger"]
    : health?.ai_enabled
      ? ["AI on", `Using ${health.model}. Voices: ${health.tts === "gemini" ? "Gemini" : "browser"}.`, "bg-success"]
      : ["Keyword mode", "No Gemini API key: keyword search and browser voices only.", "bg-warning"];
  return (
    <span
      title={detail}
      className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 sm:inline-flex"
    >
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {label}
      <span className="sr-only">: {detail}</span>
    </span>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M10 21.5 16 10.5l6 11"
        fill="none"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="21.5" r="3" fill="white" />
      <circle cx="16" cy="10.5" r="3" fill="white" />
      <circle cx="22" cy="21.5" r="3" fill="white" />
    </svg>
  );
}
