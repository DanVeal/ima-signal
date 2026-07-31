"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";
import { getAllPramsSectionSummaries } from "@/lib/mock/prams-library";

/** Scalable, searchable replacement for a fixed row of phase pills — see PRAMS round-3 feedback. */
export function SectionNavigator({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const summaries = useMemo(() => getAllPramsSectionSummaries(), []);

  const filtered = summaries.filter(
    (s) => query.trim().length === 0 || s.section?.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search announcement sections…"
          className="h-10 rounded-lg pl-10 text-sm"
          aria-label="Search announcement sections"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="No sections match" description="Try a different search term." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {filtered.map((s) => {
              if (!s.section) return null;
              const { section } = s;
              const pct = (n: number) => (s.variantCount === 0 ? 0 : (n / s.variantCount) * 100);
              return (
                <Link
                  key={section.id}
                  href={`/projects/${projectId}/sections/${section.id}`}
                  className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text-primary">{section.name}</p>
                      {!section.available && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium tracking-wide text-text-muted uppercase">
                          Not yet transcribed
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {s.variantCount} announcement variant{s.variantCount === 1 ? "" : "s"} ·{" "}
                      {s.recordingProgress}% recorded
                    </p>
                    <div className="mt-2 flex h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full bg-success" style={{ width: `${pct(s.approved)}%` }} />
                      <div className="h-full bg-signal-600" style={{ width: `${pct(s.awaitingReview)}%` }} />
                      <div className="h-full bg-important" style={{ width: `${pct(s.changesRequested)}%` }} />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {s.needsAttention > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                          "bg-important-100 text-important",
                        )}
                      >
                        <AlertTriangle className="size-3.5" strokeWidth={2.25} />
                        {s.needsAttention} need{s.needsAttention === 1 ? "s" : ""} attention
                      </span>
                    )}
                    <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
