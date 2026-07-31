"use client";

import Link from "next/link";
import { ChevronRight, Pin, Star } from "lucide-react";
import { ProjectStatusBadge } from "@/components/status/project-status-badge";
import { ProjectTypeBadge } from "@/components/status/project-type-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { usePinnedProjects, useFavouriteProjects } from "@/lib/productivity/project-marks";
import { cn } from "@/lib/utils";
import type { ProjectListRow } from "@/lib/projects/queries";

export function ProjectCard({ project }: { project: ProjectListRow }) {
  const { progress } = project;
  const progressPercent = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);
  const pinned = usePinnedProjects();
  const favourite = useFavouriteProjects();
  const isPinned = pinned.has(project.id);
  const isFavourite = favourite.has(project.id);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-5 transition-all hover:border-brand/40 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink-900 group-hover:text-brand">{project.name}</h3>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {[project.campaignName, project.studioName].filter(Boolean).join(" · ") || project.jobNumber}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={isFavourite}
            onClick={(e) => {
              e.preventDefault();
              favourite.toggle(project.id);
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-ink-100",
              isFavourite ? "text-amber-500" : "text-text-muted opacity-0 group-hover:opacity-100",
            )}
          >
            <Star className="size-4" fill={isFavourite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            aria-label={isPinned ? "Unpin project" : "Pin project"}
            aria-pressed={isPinned}
            onClick={(e) => {
              e.preventDefault();
              pinned.toggle(project.id);
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-ink-100",
              isPinned ? "text-brand" : "text-text-muted opacity-0 group-hover:opacity-100",
            )}
          >
            <Pin className="size-4" fill={isPinned ? "currentColor" : "none"} />
          </button>
          <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProjectTypeBadge type={project.type} />
        {project.type === "standard_radio" && <ProjectStatusBadge status={project.status} />}
        {project.status !== "delivered" && project.liveDate && <DeadlineBadge date={project.liveDate} />}
      </div>

      {progress.total > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-text-muted">
            {progress.approved}/{progress.total} approved
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <p className="mt-auto font-mono text-[11px] text-text-muted">{project.jobNumber}</p>
    </Link>
  );
}
