"use client";

import { useSyncExternalStore } from "react";

let cached = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    cached = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      cached = Math.floor(Date.now() / 1000);
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot() {
  if (cached === 0) cached = Math.floor(Date.now() / 1000);
  return cached;
}

/** Unix seconds, ticking every second; 0 in server HTML so nothing time-based is prerendered. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** `2d 04h`, `04:12:09`, `00:00` */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
