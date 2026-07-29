import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProjectStatusBadge } from "@/components/status/project-status-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { getCampaign, getOrganisation, getProjectProgress } from "@/lib/mock/queries";
import type { Project } from "@/types/domain";

export function ProjectRow({ project }: { project: Project }) {
  const campaign = getCampaign(project.campaignId);
  const studio = getOrganisation(project.studioOrganisationId);
  const progress = getProjectProgress(project.id);
  const progressPercent = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group grid grid-cols-1 items-center gap-2 border-b border-border-subtle px-1 py-4 transition-colors hover:bg-ink-50 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-6 sm:px-2"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold text-ink-900 group-hover:text-brand">
            {project.name}
          </h3>
          <span className="hidden shrink-0 font-mono text-[11px] text-text-muted sm:inline">
            {project.jobNumber}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {campaign?.name} · {studio?.name}
        </p>
      </div>

      <div className="hidden w-32 shrink-0 sm:block">
        <p className="text-xs text-text-muted">
          {progress.approved}/{progress.total} approved
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        {project.status !== "delivered" && <DeadlineBadge date={project.liveDate} />}
      </div>

      <ChevronRight className="hidden size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}
