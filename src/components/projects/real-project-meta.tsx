import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate, initialsFromName } from "@/lib/format";
import type { ProjectDetail } from "@/lib/projects/queries";

function DateStat({ label, date }: { label: string; date: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-text-primary">{date ? formatDate(date) : "—"}</p>
    </div>
  );
}

export function RealProjectMeta({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-border bg-surface-raised p-5 sm:grid-cols-4">
      <DateStat label="Recording deadline" date={project.recordingDeadline} />
      <DateStat label="Internal review" date={project.internalReviewDeadline} />
      <DateStat label="Client review" date={project.clientReviewDeadline} />
      <DateStat label="Live date" date={project.liveDate} />

      <div className="col-span-2 sm:col-span-1">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">IMA owner</p>
        {project.ownerName ? (
          <div className="mt-1 flex items-center gap-2">
            <Avatar className="size-6">
              <AvatarFallback className="bg-brand-100 text-[11px] font-medium text-brand">
                {initialsFromName(project.ownerName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-text-emphasis">{project.ownerName}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-text-muted">Not assigned</p>
        )}
      </div>

      <div className="col-span-2 sm:col-span-1">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">Recording studio</p>
        <p className="mt-1.5 text-sm text-text-emphasis">{project.studioName ?? "Not assigned"}</p>
      </div>

      <div className="col-span-2 sm:col-span-2">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">Jet2 reviewers</p>
        {project.jet2ReviewerNames.length > 0 ? (
          <div className="mt-1 flex -space-x-2">
            {project.jet2ReviewerNames.map((name) => (
              <Avatar key={name} className="size-6 border-2 border-surface-raised">
                <AvatarFallback className="bg-comment-100 text-[11px] font-medium text-comment">
                  {initialsFromName(name)}
                </AvatarFallback>
              </Avatar>
            ))}
            <span className="ml-3 self-center text-sm text-text-emphasis">{project.jet2ReviewerNames.join(", ")}</span>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-text-muted">None assigned yet</p>
        )}
      </div>
    </div>
  );
}
