"use client";

/**
 * Recently Viewed + Continue Reviewing (Phase 3.0) — a small, client-only
 * history of the projects and recordings a user has actually opened, most
 * recent first. Browser-local (like the demo "preview as" context and draft
 * comments), not a new backend feature.
 */
import { useLocalStorageState } from "@/lib/use-local-storage-state";

export interface RecentlyViewedItem {
  id: string;
  type: "project" | "recording";
  label: string;
  subtitle?: string;
  url: string;
  visitedAt: string;
}

const STORAGE_KEY = "ima-signal.recently-viewed";
const MAX_ITEMS = 20;

export function useRecentlyViewed() {
  const [items, setItems] = useLocalStorageState<RecentlyViewedItem[]>(STORAGE_KEY, []);

  function recordVisit(item: Omit<RecentlyViewedItem, "visitedAt">) {
    setItems((prev) => {
      const withoutThis = prev.filter((existing) => existing.id !== item.id);
      return [{ ...item, visitedAt: new Date().toISOString() }, ...withoutThis].slice(0, MAX_ITEMS);
    });
  }

  return { items, recordVisit };
}
