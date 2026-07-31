"use client";

/**
 * Shared client-only localStorage-backed state (view preferences, saved
 * filters, pinned/favourite projects, productivity features — Phase 3.0).
 * Backed by useSyncExternalStore rather than a plain useState + effect: two
 * components reading/writing the SAME key (e.g. a project card's pin toggle
 * and the projects list's "Pinned" section) must see each other's updates
 * immediately, and a plain per-component useState copy can't do that — each
 * instance would hold its own stale snapshot. A module-level cache + listener
 * set makes every hook call for a given key one shared value.
 */
import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, unknown>();

function readFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  const stored = window.localStorage.getItem(key);
  if (stored === null) return defaultValue;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
}

function getSnapshot<T>(key: string, defaultValue: T): T {
  if (!cache.has(key)) cache.set(key, readFromStorage(key, defaultValue));
  return cache.get(key) as T;
}

function setSnapshot<T>(key: string, value: T) {
  cache.set(key, value);
  window.localStorage.setItem(key, JSON.stringify(value));
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => {
    listeners.get(key)?.delete(listener);
  };
}

export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const subscribeToKey = useCallback((listener: () => void) => subscribe(key, listener), [key]);
  const getClientSnapshot = useCallback(() => getSnapshot(key, defaultValue), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const getServerSnapshot = useCallback(() => defaultValue, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useSyncExternalStore(subscribeToKey, getClientSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = getSnapshot(key, defaultValue);
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      setSnapshot(key, resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, setValue] as const;
}
