"use client";

import { useLocalStorageState } from "@/lib/use-local-storage-state";

export const PLAYBACK_RATE_KEY = "ima-signal.playback-rate";
export const SKIP_SECONDS_KEY = "ima-signal.skip-seconds";

export const DEFAULT_PLAYBACK_RATE = 1;
export const DEFAULT_SKIP_SECONDS = 5;

export const PLAYBACK_RATE_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
export const SKIP_SECONDS_OPTIONS = [5, 10, 15] as const;

/** Read/write the user's default playback speed and skip interval — applied by AudioPlaybackProvider/AudioPlayer, editable from Settings > Playback. */
export function usePlaybackPreferences() {
  const [rate, setRate] = useLocalStorageState(PLAYBACK_RATE_KEY, DEFAULT_PLAYBACK_RATE);
  const [skipSeconds, setSkipSeconds] = useLocalStorageState(SKIP_SECONDS_KEY, DEFAULT_SKIP_SECONDS);
  return { rate, setRate, skipSeconds, setSkipSeconds };
}
