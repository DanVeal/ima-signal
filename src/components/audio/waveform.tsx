"use client";

import { useMemo, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { formatTimecode } from "@/lib/format";

export interface WaveformCommentMarker {
  id: string;
  startMs: number;
  endMs: number | null;
  isResolved: boolean;
  isHighlighted: boolean;
}

/** AI comparison findings — rendered above the waveform (comment markers render below), in a quiet slate/violet rather than the amber/green used for human comments, so the two never read as the same kind of thing. */
export interface WaveformFindingMarker {
  id: string;
  startMs: number;
  endMs: number | null;
  isHighlighted: boolean;
  isIssue: boolean;
}

/** A marker's own timecode can legitimately exceed durationMs (e.g. AI findings timed against a slightly different transcript pass, or a comment left before a shorter replacement take) — clamped to [0, 1] so a stale timecode never balloons this container past its own width and drags the whole page into horizontal overflow. */
function clampRatio(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

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
  markers,
  onMarkerClick,
  onRequestComment,
  findingMarkers,
  onFindingMarkerClick,
}: {
  seed: string;
  peaks?: number[] | null;
  className?: string;
  /** Timecoded comment threads to render as pins along the timeline — see docs/review-engine.md's Comments section. */
  markers?: WaveformCommentMarker[];
  onMarkerClick?: (id: string) => void;
  /** When supplied, hovering shows a "+" affordance that opens a new timecoded comment at the hovered time instead of seeking. */
  onRequestComment?: (ms: number) => void;
  /** AI comparison findings — see docs/intelligence-engine.md's Review Experience section. */
  findingMarkers?: WaveformFindingMarker[];
  onFindingMarkerClick?: (id: string) => void;
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

      {durationMs > 0 &&
        markers?.map((marker) => {
          const startRatio = clampRatio(marker.startMs / durationMs);
          const endRatio = marker.endMs != null ? clampRatio(marker.endMs / durationMs) : startRatio;
          return (
            <span
              key={marker.id}
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(marker.id);
              }}
              title={formatTimecode(marker.startMs)}
              className={`pointer-events-auto absolute -bottom-2.5 h-2 min-w-1 -translate-x-1/2 rounded-full transition-all ${
                marker.isHighlighted
                  ? "z-10 scale-125 bg-amber-500 shadow-[0_0_0_3px_var(--brand-primary-100)]"
                  : marker.isResolved
                    ? "bg-emerald-400/70 hover:bg-emerald-500"
                    : "bg-amber-400/80 hover:bg-amber-500"
              }`}
              style={{
                left: `${startRatio * 100}%`,
                width: `${Math.max((endRatio - startRatio) * 100, 0.6)}%`,
              }}
            />
          );
        })}

      {durationMs > 0 &&
        findingMarkers?.map((marker) => {
          const startRatio = clampRatio(marker.startMs / durationMs);
          const endRatio = marker.endMs != null ? clampRatio(marker.endMs / durationMs) : startRatio;
          return (
            <span
              key={marker.id}
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onFindingMarkerClick?.(marker.id);
              }}
              title={formatTimecode(marker.startMs)}
              className={`pointer-events-auto absolute -top-2.5 h-2 min-w-1 -translate-x-1/2 rounded-full transition-all ${
                marker.isHighlighted
                  ? "z-10 scale-125 bg-violet-500 shadow-[0_0_0_3px_var(--brand-primary-100)]"
                  : marker.isIssue
                    ? "bg-violet-400/70 hover:bg-violet-500"
                    : "bg-slate-300/70 hover:bg-slate-400"
              }`}
              style={{
                left: `${startRatio * 100}%`,
                width: `${Math.max((endRatio - startRatio) * 100, 0.6)}%`,
              }}
            />
          );
        })}

      {hoverRatio !== null && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-ink-900 py-1 pr-2 pl-2 font-mono text-[11px] text-white shadow-md"
          style={{ left: `${hoverRatio * 100}%` }}
        >
          {formatTimecode(hoverRatio * durationMs)}
        </div>
      )}

      {onRequestComment && hoverRatio !== null && (
        <button
          type="button"
          aria-label="Add a comment at this time"
          onClick={(e) => {
            e.stopPropagation();
            onRequestComment(hoverRatio * durationMs);
          }}
          className="pointer-events-auto absolute top-1/2 z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink-900 text-white shadow-md transition-transform hover:scale-110"
          style={{ left: `${hoverRatio * 100}%` }}
        >
          <MessageSquarePlus className="size-3.5" />
        </button>
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
