import Link from "next/link";
import { ArrowRight, FileAudio } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { formatDuration } from "@/lib/format";
import type { RecordingRow } from "@/lib/audio/queries";

export function RealVariantList({ projectId, rows }: { projectId: string; rows: RecordingRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FileAudio}
        title="No script variants yet"
        description="Create a script variant to start briefing the studio."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <Link
            key={row.subjectId}
            href={
              row.audioItemId
                ? `/projects/${projectId}/recordings/${row.audioItemId}`
                : `/projects/${projectId}/recordings`
            }
            className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{row.label}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {row.currentVersion ? (
                <span className="text-xs text-text-secondary">
                  {row.currentVersion.durationSeconds != null
                    ? formatDuration(row.currentVersion.durationSeconds)
                    : "—"}{" "}
                  · v{row.currentVersion.versionNumber}
                </span>
              ) : (
                <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">
                  No audio yet
                </span>
              )}
              <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
