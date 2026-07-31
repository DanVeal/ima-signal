"use client";

import { Play, Pause, RotateCcw, RotateCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Waveform, type WaveformCommentMarker, type WaveformFindingMarker } from "./waveform";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { usePlaybackPreferences, PLAYBACK_RATE_OPTIONS } from "@/lib/playback-preferences";
import { formatTimecode } from "@/lib/format";

const RATES = PLAYBACK_RATE_OPTIONS;

/**
 * `seed` drives the mock-data fallback waveform (see waveform.tsx); pass
 * `peaks` (real data, from audio_versions.waveform_peaks) when available —
 * every Phase 2C.1 recording has one.
 */
export function AudioPlayer({
  seed,
  peaks,
  markers,
  onMarkerClick,
  onRequestComment,
  findingMarkers,
  onFindingMarkerClick,
}: {
  seed: string;
  peaks?: number[] | null;
  markers?: WaveformCommentMarker[];
  onMarkerClick?: (id: string) => void;
  onRequestComment?: (ms: number) => void;
  findingMarkers?: WaveformFindingMarker[];
  onFindingMarkerClick?: (id: string) => void;
}) {
  const { isPlaying, isBuffering, toggle, skip, currentMs, durationMs, playbackRate, setPlaybackRate } =
    useAudioPlayback();
  const { skipSeconds } = usePlaybackPreferences();

  const nextRate = () => {
    const idx = (RATES as readonly number[]).indexOf(playbackRate);
    setPlaybackRate(RATES[(idx + 1) % RATES.length]);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-sunken p-5 sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Back ${skipSeconds} seconds`}
          onClick={() => skip(-skipSeconds * 1000)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={toggle}
          disabled={isBuffering && !isPlaying}
          className="size-12 rounded-full shadow-sm transition-transform active:scale-95"
        >
          <span key={isBuffering && !isPlaying ? "buffering" : isPlaying ? "playing" : "paused"} className="animate-in fade-in zoom-in-75 duration-150">
            {isBuffering && !isPlaying ? (
              <Loader2 className="size-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5" />
            )}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Forward ${skipSeconds} seconds`}
          onClick={() => skip(skipSeconds * 1000)}
        >
          <RotateCw className="size-4" />
        </Button>
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <Waveform
          seed={seed}
          peaks={peaks}
          markers={markers}
          onMarkerClick={onMarkerClick}
          onRequestComment={onRequestComment}
          findingMarkers={findingMarkers}
          onFindingMarkerClick={onFindingMarkerClick}
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
          {isBuffering && isPlaying && <span className="ml-1.5 text-text-muted">buffering…</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={nextRate}
          className="h-6 rounded-full font-mono text-xs"
          aria-label="Change playback speed"
        >
          {playbackRate}×
        </Button>
      </div>
    </div>
  );
}
