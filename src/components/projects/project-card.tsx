import Link from "next/link";
import { ProjectStatusBadge } from "@/components/status/project-status-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { formatDate } from "@/lib/format";
import { getCampaign, getOrganisation, getProjectProgress } from "@/lib/mock/queries";
import type { Project } from "@/types/domain";

export function ProjectCard({ project }: { project: Project }) {
  const campaign = getCampaign(project.campaignId);
  const studio = getOrganisation(project.studioOrganisationId);
  const progress = getProjectProgress(project.id);
  const progressPercent = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col justify-between rounded-lg border border-border bg-surface-raised p-5 transition-all hover:border-border-strong hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
            {campaign?.name}
          </p>
          <span className="shrink-0 font-mono text-[11px] text-text-muted">{project.jobNumber}</span>
        </div>
        <h3 className="mt-1.5 text-base font-semibold text-ink-900 group-hover:text-brand">
          {project.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{project.description}</p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.status} />
          {project.status !== "delivered" && <DeadlineBadge date={project.liveDate} />}
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {progress.approved} of {progress.total} variants approved
            </span>
            <span>{studio?.name}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-text-muted">Live {formatDate(project.liveDate)}</p>
      </div>
    </Link>
  );
}
