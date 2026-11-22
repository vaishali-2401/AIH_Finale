"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Health } from "@/lib/types";

const INTERVAL_MS = 30_000;

/** Polls `/api/health`. `health` is null while unknown or offline. */
export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      setHealth(await api.health(AbortSignal.timeout(5000)));
      setOnline(true);
    } catch {
      setHealth(null);
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    // Initial check + polling; state is only set once the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const timer = setInterval(check, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [check]);

  return { health, online, recheck: check };
}
