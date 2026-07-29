"use client";

import { Play, Pause, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Waveform } from "./waveform";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { formatTimecode } from "@/lib/format";

const RATES = [0.75, 1, 1.25, 1.5];

export function AudioPlayer({ seed }: { seed: string }) {
  const { isPlaying, toggle, skip, currentMs, durationMs, playbackRate, setPlaybackRate } =
    useAudioPlayback();

  const nextRate = () => {
    const idx = RATES.indexOf(playbackRate);
    setPlaybackRate(RATES[(idx + 1) % RATES.length]);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-surface-sunken p-5 sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back 5 seconds"
          onClick={() => skip(-5000)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={toggle}
          className="size-12 rounded-full shadow-sm transition-transform active:scale-95"
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Forward 5 seconds"
          onClick={() => skip(5000)}
        >
          <RotateCw className="size-4" />
        </Button>
      </div>

      <div className="min-w-0 flex-1">
        <Waveform seed={seed} />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
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
