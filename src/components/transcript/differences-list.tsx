"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SeverityBadge } from "@/components/status/severity-badge";
import { EmptyState } from "@/components/states/empty-state";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DifferenceSeverity, QcDifference } from "@/types/domain";

const FILTERS: (DifferenceSeverity | "all")[] = ["all", "critical", "important", "minor", "uncertain"];

export function DifferencesList({ differences }: { differences: QcDifference[] }) {
  const { seek } = useAudioPlayback();
  const [filter, setFilter] = useState<DifferenceSeverity | "all">("all");

  const filtered = differences.filter((d) => filter === "all" || d.severity === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter differences by severity">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "border-brand bg-brand text-white"
                : "border-border text-text-secondary hover:border-border-strong",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No differences here"
          description="Nothing in this severity band for this version."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((diff) => (
            <li key={diff.id}>
              <button
                onClick={() => seek(diff.startMs)}
                className="w-full rounded-md border border-border-subtle p-3 text-left transition-colors hover:border-border-strong hover:bg-ink-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={diff.severity} compact />
                  <span className="font-mono text-[11px] text-text-muted">
                    {formatTimecode(diff.startMs)}
                  </span>
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-text-muted">Expected</dt>
                    <dd className="text-ink-800">&ldquo;{diff.expectedText}&rdquo;</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-text-muted">Recorded</dt>
                    <dd className="text-ink-800">&ldquo;{diff.actualText}&rdquo;</dd>
                  </div>
                </dl>
                {diff.scriptSectionRef && (
                  <p className="mt-1.5 text-[11px] text-text-muted">{diff.scriptSectionRef}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
