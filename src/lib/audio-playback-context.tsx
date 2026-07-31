"use client";

/**
 * Shared playback clock, in two flavours behind one context/hook so the
 * player UI (AudioPlayer, Waveform) never needs to know which it's under:
 *
 * - `AudioPlaybackProvider` (below) simulates a clock at real time — no
 *   audio file involved. Still used by the mock-data-driven QC/review
 *   screens (src/lib/mock/*), which have no real audio to attach yet.
 * - `RealAudioPlaybackProvider` (bottom of this file) wraps a real
 *   `<audio>` element and a real signed Supabase Storage URL — used by the
 *   Phase 2C.1 recordings UI. Same context shape, real events instead of a
 *   simulated tick.
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
  /** True while the real <audio> element is fetching/decoding and can't play forward yet. Always false for the simulated clock. */
  isBuffering: boolean;
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
        isBuffering: false,
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

/**
 * Drives the same context from a real `<audio>` element and a real (signed)
 * source URL. Mount with `key={src}` at the call site so switching
 * recordings/versions remounts a fresh element instead of trying to reuse
 * one mid-playback. Keyboard shortcuts (space, ←/→) are global while
 * mounted, ignored while focus is in a text input.
 */
export function RealAudioPlaybackProvider({
  src,
  children,
}: {
  src: string;
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playbackRate, setPlaybackRateState] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentMs(audio.currentTime * 1000);
    const onLoadedMetadata = () => setDurationMs(audio.duration * 1000);
    const onDurationChange = () => setDurationMs(audio.duration * 1000);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => setIsBuffering(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);

    // The browser can finish loading (and fire loadedmetadata/canplay)
    // before this effect attaches its listeners — reconcile with whatever
    // state the element is ALREADY in, or isBuffering gets stuck true and
    // duration stuck 0 forever for a fast-loading (e.g. cached/local) file.
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) setIsBuffering(false);
    if (audio.duration) setDurationMs(audio.duration * 1000);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
    };
  }, []);

  const play = useCallback(() => {
    void audioRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(ms, 0), (audio.duration || 0) * 1000) / 1000;
  }, []);

  const skip = useCallback((deltaMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(
      Math.max(audio.currentTime + deltaMs / 1000, 0),
      audio.duration || Infinity,
    );
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        skip(5000);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        skip(-5000);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, skip]);

  return (
    <AudioPlaybackContext.Provider
      value={{
        currentMs,
        durationMs,
        isPlaying,
        playbackRate,
        isBuffering,
        play,
        pause,
        toggle,
        seek,
        skip,
        setPlaybackRate,
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      {children}
    </AudioPlaybackContext.Provider>
  );
}
