"use client";

import Link from "next/link";
import { Clock, FolderKanban, Mic, PlayCircle } from "lucide-react";
import { Section } from "@/components/nav/page-container";
import { EmptyState } from "@/components/states/empty-state";
import { useRecentlyViewed } from "@/lib/productivity/recently-viewed";

/**
 * "Continue Reviewing" + "Recently Viewed" (Phase 3.0) — client-only, reads
 * the same browser-local history the RecordVisit tracker writes on every
 * project/recording page visit. Renders nothing (not even an empty state)
 * until there's real history, so a first-run workspace stays uncluttered.
 */
export function ProductivityWidgets() {
  const { items } = useRecentlyViewed();
  if (items.length === 0) return null;

  const lastRecording = items.find((item) => item.type === "recording");
  const recent = items.slice(0, 6);

  return (
    <div className="mb-12 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
      {lastRecording && (
        <Section title="Continue reviewing" description="Pick up where you left off.">
          <Link
            href={lastRecording.url}
            className="flex items-center gap-4 rounded-lg border border-border bg-surface-raised px-4 py-3.5 transition-colors hover:border-brand/40 hover:bg-brand-100/10"
          >
            <PlayCircle className="size-8 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{lastRecording.label}</p>
              <p className="text-xs text-text-muted">Last opened recording</p>
            </div>
          </Link>
        </Section>
      )}

      <Section title="Recently viewed" description="Your last few projects and recordings.">
        {recent.length === 0 ? (
          <EmptyState icon={Clock} title="Nothing yet" description="Pages you open will show up here." className="py-8" />
        ) : (
          <ul className="space-y-1">
            {recent.map((item) => {
              const Icon = item.type === "recording" ? Mic : FolderKanban;
              return (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    href={item.url}
                    className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-50"
                  >
                    <Icon className="size-3.5 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-emphasis">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
