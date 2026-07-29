"use client";

/**
 * Shared playback clock for the audio review screen. There's no real audio
 * file to decode yet (Phase 4 wires up Supabase Storage + real <audio>
 * playback) — this drives a simulated clock at real time so the player,
 * waveform, transcript highlighting and difference list can all stay in
 * sync exactly as they will once real audio is attached.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AudioPlaybackContextValue {
  currentMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
  skip: (deltaMs: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const AudioPlaybackContext = createContext<AudioPlaybackContextValue | undefined>(undefined);

/**
 * Mount with `key={audioVersionId}` at the call site so switching versions
 * remounts a fresh clock instead of resetting state inside an effect.
 */
export function AudioPlaybackProvider({
  durationMs,
  children,
}: {
  durationMs: number;
  children: React.ReactNode;
}) {
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      const deltaMs = (now - last) * playbackRate;
      lastTickRef.current = now;
      setCurrentMs((prev) => {
        const next = prev + deltaMs;
        if (next >= durationMs) {
          setIsPlaying(false);
          return durationMs;
        }
        return next;
      });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, playbackRate, durationMs]);

  const play = useCallback(() => {
    setCurrentMs((prev) => (prev >= durationMs ? 0 : prev));
    setIsPlaying(true);
  }, [durationMs]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => setIsPlaying((p) => !p), []);

  const seek = useCallback(
    (ms: number) => {
      setCurrentMs(Math.min(Math.max(ms, 0), durationMs));
    },
    [durationMs],
  );

  const skip = useCallback(
    (deltaMs: number) => {
      setCurrentMs((prev) => Math.min(Math.max(prev + deltaMs, 0), durationMs));
    },
    [durationMs],
  );

  return (
    <AudioPlaybackContext.Provider
      value={{
        currentMs,
        durationMs,
        isPlaying,
        playbackRate,
        play,
        pause,
        toggle,
        seek,
        skip,
        setPlaybackRate: setPlaybackRateState,
      }}
    >
      {children}
    </AudioPlaybackContext.Provider>
  );
}

export function useAudioPlayback() {
  const ctx = useContext(AudioPlaybackContext);
  if (!ctx) throw new Error("useAudioPlayback must be used within AudioPlaybackProvider");
  return ctx;
}
