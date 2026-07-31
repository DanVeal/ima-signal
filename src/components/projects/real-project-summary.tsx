import Link from "next/link";
import { ArrowRight, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectDetail } from "@/lib/projects/queries";

/**
 * Replaces the mock BriefPanel's briefing-notes/mandatory-wording/important-
 * claims sections — those were never real columns (no schema change this
 * phase), so this shows what the real schema actually has: the project's
 * description, plus a live progress readout, rather than fabricating the
 * rest. See docs/production-experience.md.
 */
export function RealProjectSummary({ project }: { project: ProjectDetail }) {
  const progressPercent =
    project.progress.total === 0 ? 0 : Math.round((project.progress.approved / project.progress.total) * 100);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface-raised p-5 lg:col-span-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <FileText className="size-4 text-brand" />
          Description
        </h3>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-text-secondary">
          {project.description || "No description added yet."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <h3 className="text-sm font-semibold text-ink-900">Review progress</h3>
          <p className="mt-2 text-xs text-text-muted">
            {project.progress.approved}/{project.progress.total} recordings approved
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            render={<Link href={`/projects/${project.id}/recordings`} />}
          >
            View recordings
            <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {project.openChangeRequestCount > 0 && (
          <div className="rounded-lg border border-important/25 bg-important-100 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-important">
              <ShieldAlert className="size-4" />
              {project.openChangeRequestCount} open change request
              {project.openChangeRequestCount === 1 ? "" : "s"}
            </h3>
            <p className="mt-1 text-xs text-ink-800">Waiting on the studio or the next reviewer to address.</p>
          </div>
        )}
      </div>
    </div>
  );
}
