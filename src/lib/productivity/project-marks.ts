"use client";

/**
 * Pinned Projects + Favourite Projects (Phase 3.0) — two independent,
 * browser-local marks a producer can put on any project. Pinned surfaces a
 * project as a quick-access shortcut (e.g. a dashboard/nav row); Favourite
 * is a lighter personal bookmark shown inline on the Projects list.
 */
import { useLocalStorageState } from "@/lib/use-local-storage-state";

const PINNED_KEY = "ima-signal.pinned-projects";
const FAVOURITE_KEY = "ima-signal.favourite-projects";

function useProjectIdSet(storageKey: string) {
  const [ids, setIds] = useLocalStorageState<string[]>(storageKey, []);

  function toggle(projectId: string) {
    setIds((prev) => (prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]));
  }

  return { ids, has: (projectId: string) => ids.includes(projectId), toggle };
}

export function usePinnedProjects() {
  return useProjectIdSet(PINNED_KEY);
}

export function useFavouriteProjects() {
  return useProjectIdSet(FAVOURITE_KEY);
}
