"use client";

import { useMemo, useRef } from "react";
import { useAudioPlayback } from "@/lib/audio-playback-context";

function seededBars(seed: string, count: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  let value = hash;
  for (let i = 0; i < count; i++) {
    value = (value * 1103515245 + 12345) >>> 0;
    const envelope = Math.sin((i / count) * Math.PI);
    const noise = (value % 1000) / 1000;
    bars.push(0.18 + envelope * 0.7 * (0.4 + noise * 0.6));
  }
  return bars;
}

/**
 * A deterministic generated waveform (no audio file to decode yet — Phase 4
 * will render this from real peak data). Seeded by audio version id so it
 * stays stable across renders for the same recording.
 */
export function Waveform({ seed, className }: { seed: string; className?: string }) {
  const { currentMs, durationMs, seek } = useAudioPlayback();
  const bars = useMemo(() => seededBars(seed, 120), [seed]);
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = durationMs === 0 ? 0 : currentMs / durationMs;

  const handleSeek = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    seek(ratio * durationMs);
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Seek audio position"
      aria-valuemin={0}
      aria-valuemax={durationMs}
      aria-valuenow={currentMs}
      tabIndex={0}
      onClick={(e) => handleSeek(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") seek(currentMs + 2000);
        if (e.key === "ArrowLeft") seek(currentMs - 2000);
      }}
      className={`relative flex h-16 w-full cursor-pointer items-center gap-[2px] rounded-md bg-surface-sunken px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      {bars.map((height, i) => {
        const barProgress = i / bars.length;
        const played = barProgress <= progress;
        return (
          <span
            key={i}
            className={`w-full flex-1 rounded-full transition-colors ${played ? "bg-brand" : "bg-ink-300"}`}
            style={{ height: `${height * 100}%` }}
          />
        );
      })}
      <span
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-900"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  );
}
