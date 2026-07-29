import Link from "next/link";
import { FileAudio, ArrowRight, ShieldCheck, CircleDashed } from "lucide-react";
import { AudioStatusBadge } from "@/components/status/audio-status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { getBatchReviewRows } from "@/lib/mock/queries";

export function VariantList({ projectId }: { projectId: string }) {
  const rows = getBatchReviewRows(projectId);

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
            key={row.script.id}
            href={
              row.audioItem.id
                ? `/projects/${projectId}/audio/${row.audioItem.id}`
                : `/projects/${projectId}`
            }
            className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-ink-900">{row.script.title}</p>
                {row.script.versions.some((v) => v.isApprovedForRecording) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                    <ShieldCheck className="size-3" />
                    Approved for recording
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
                    <CircleDashed className="size-3" />
                    Draft
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
                {row.script.departureAirport} → {row.script.destination}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {row.matchPercentage !== undefined && (
                <span className="text-xs font-medium text-text-secondary">
                  {row.matchPercentage}% script match
                </span>
              )}
              {row.criticalCount > 0 && (
                <span className="rounded-full bg-critical-100 px-2 py-0.5 text-[11px] font-medium text-critical">
                  {row.criticalCount} critical
                </span>
              )}
              {row.latestVersion ? (
                <AudioStatusBadge status={row.latestVersion.status} />
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
