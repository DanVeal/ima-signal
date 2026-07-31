"use client";

import { useMemo, useRef, useState } from "react";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { formatTimecode } from "@/lib/format";

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
    bars.push(0.16 + envelope * 0.75 * (0.4 + noise * 0.6));
  }
  return bars;
}

/**
 * Renders real peak data (`peaks`, from audio_versions.waveform_peaks —
 * see docs/audio-foundation.md) when supplied. Falls back to a
 * deterministic generated waveform, seeded by `seed` so it stays stable
 * across renders, for the mock-data-driven QC/review screens that have no
 * real audio file at all.
 */
export function Waveform({
  seed,
  peaks,
  className,
}: {
  seed: string;
  peaks?: number[] | null;
  className?: string;
}) {
  const { currentMs, durationMs, isPlaying, seek } = useAudioPlayback();
  const generated = useMemo(() => seededBars(seed, 72), [seed]);
  const bars = peaks && peaks.length > 0 ? peaks : generated;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const progress = durationMs === 0 ? 0 : currentMs / durationMs;

  const ratioFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
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
      onClick={(e) => seek(ratioFromClientX(e.clientX) * durationMs)}
      onMouseMove={(e) => setHoverRatio(ratioFromClientX(e.clientX))}
      onMouseLeave={() => setHoverRatio(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") seek(currentMs + 2000);
        if (e.key === "ArrowLeft") seek(currentMs - 2000);
      }}
      className={`group relative flex h-20 w-full min-w-0 cursor-pointer items-center gap-px outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      {bars.map((height, i) => {
        const barProgress = i / bars.length;
        const played = barProgress <= progress;
        const nearPlayhead = isPlaying && played && progress - barProgress < 0.012;
        return (
          <span
            key={i}
            className={`min-w-px flex-1 rounded-full transition-[background-color,transform] duration-150 ${
              played ? "bg-brand" : "bg-ink-200 group-hover:bg-ink-300"
            } ${nearPlayhead ? "scale-y-110" : ""}`}
            style={{ height: `${height * 100}%` }}
          />
        );
      })}

      {hoverRatio !== null && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 font-mono text-[11px] text-white shadow-md"
          style={{ left: `${hoverRatio * 100}%` }}
        >
          {formatTimecode(hoverRatio * durationMs)}
        </div>
      )}

      <span
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-900"
        style={{ left: `${progress * 100}%` }}
      />
      <span
        className={`pointer-events-none absolute -top-0.5 size-2 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_0_3px_var(--brand-primary-100)] ${
          isPlaying ? "animate-pulse" : ""
        }`}
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  );
}
