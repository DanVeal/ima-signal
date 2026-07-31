"use client";

import { useEffect } from "react";
import { useRecentlyViewed, type RecentlyViewedItem } from "@/lib/productivity/recently-viewed";

/**
 * Drops into a server-rendered page to log this visit for "Recently Viewed"
 * / "Continue Reviewing" — renders nothing itself. Server pages already
 * resolved the label/url; this just records it client-side on mount.
 */
export function RecordVisit({ item }: { item: Omit<RecentlyViewedItem, "visitedAt"> }) {
  const { recordVisit } = useRecentlyViewed();

  useEffect(() => {
    recordVisit(item);
    // Record once per navigation to this id — re-running on every render
    // would just bump the same entry's timestamp pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return null;
}
