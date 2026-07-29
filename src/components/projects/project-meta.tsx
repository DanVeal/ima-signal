import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate } from "@/lib/format";
import { getOrganisation, getUser } from "@/lib/mock/queries";
import type { Project } from "@/types/domain";

function DateStat({ label, date }: { label: string; date: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink-900">{formatDate(date)}</p>
    </div>
  );
}

export function ProjectMeta({ project }: { project: Project }) {
  const owner = getUser(project.ownerUserId);
  const studio = getOrganisation(project.studioOrganisationId);
  const reviewers = project.jet2ReviewerUserIds.map((id) => getUser(id)).filter(Boolean);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-border bg-surface-raised p-5 sm:grid-cols-4">
      <DateStat label="Recording deadline" date={project.recordingDeadline} />
      <DateStat label="Internal review" date={project.internalReviewDeadline} />
      <DateStat label="Client review" date={project.clientReviewDeadline} />
      <DateStat label="Live date" date={project.liveDate} />

      <div className="col-span-2 sm:col-span-1">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">IMA owner</p>
        <div className="mt-1 flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="bg-brand-100 text-[11px] font-medium text-brand">
              {owner?.avatarInitials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-ink-800">{owner?.fullName}</span>
        </div>
      </div>

      <div className="col-span-2 sm:col-span-1">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
          Recording studio
        </p>
        <p className="mt-1.5 text-sm text-ink-800">{studio?.name}</p>
      </div>

      <div className="col-span-2 sm:col-span-2">
        <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
          Jet2 reviewers
        </p>
        <div className="mt-1 flex -space-x-2">
          {reviewers.map((reviewer) => (
            <Avatar key={reviewer!.id} className="size-6 border-2 border-surface-raised">
              <AvatarFallback className="bg-comment-100 text-[11px] font-medium text-comment">
                {reviewer!.avatarInitials}
              </AvatarFallback>
            </Avatar>
          ))}
          <span className="ml-3 self-center text-sm text-ink-800">
            {reviewers.map((r) => r!.fullName).join(", ")}
          </span>
        </div>
      </div>
    </div>
  );
}
