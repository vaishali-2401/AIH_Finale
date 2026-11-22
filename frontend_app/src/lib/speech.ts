/**
 * Browser text-to-speech fallback for podcasts, used when the backend could
 * not produce Gemini audio (no key, TTS disabled, or the TTS call failed).
 * Reads the script line by line, giving each speaker a different voice.
 */
import type { PodcastLine } from "./types";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voices load asynchronously in some browsers (notably Chrome). */
function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

function pickVoices(voices: SpeechSynthesisVoice[], speakers: string[]) {
  const lang = navigator.language.split("-")[0] || "en";
  const preferred = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = preferred.length ? preferred : voices;
  const byName = new Map<string, SpeechSynthesisVoice | undefined>();
  speakers.forEach((speaker, i) => byName.set(speaker, pool[i % Math.max(pool.length, 1)]));
  return byName;
}

export interface SpeechPlayback {
  pause(): void;
  resume(): void;
  stop(): void;
}

export async function speakScript(
  lines: PodcastLine[],
  handlers: { onLine?: (index: number) => void; onEnd?: () => void },
  startAt = 0,
): Promise<SpeechPlayback> {
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = pickVoices(await loadVoices(), [...new Set(lines.map((l) => l.speaker))]);
  let stopped = false;

  const speak = (index: number) => {
    if (stopped) return;
    if (index >= lines.length) {
      handlers.onEnd?.();
      return;
    }
    const line = lines[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    const voice = voices.get(line.speaker);
    if (voice) utterance.voice = voice;
    // Slight pitch difference helps when only one voice is installed.
    utterance.pitch = [...voices.keys()].indexOf(line.speaker) % 2 === 0 ? 1 : 0.85;
    utterance.onstart = () => handlers.onLine?.(index);
    utterance.onend = () => speak(index + 1);
    utterance.onerror = (event) => {
      if (event.error !== "interrupted" && event.error !== "canceled") speak(index + 1);
    };
    synth.speak(utterance);
  };

  speak(startAt);
  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    stop: () => {
      stopped = true;
      synth.cancel();
    },
  };
}
