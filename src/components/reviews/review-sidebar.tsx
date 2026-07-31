import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { reviewStatusBadgeClass, REVIEW_STATUS_LABEL } from "./review-status";
import { HealthSummary } from "@/components/intelligence/health-summary";
import type {
  ApprovalsForAudioItem,
  ChangeRequestRecord,
  CommentThread,
  ReviewActivityEvent,
  ReviewParticipant,
  ReviewSummary,
} from "@/lib/review/queries";
import type { HealthSnapshotDetail } from "@/lib/intelligence/queries";

export function ReviewSidebar({
  review,
  participants,
  latestActivity,
  threads,
  changeRequests,
  approvals,
  currentVersionId,
  health,
}: {
  review: ReviewSummary;
  participants: ReviewParticipant[];
  latestActivity: ReviewActivityEvent[];
  threads: CommentThread[];
  changeRequests: ChangeRequestRecord[];
  approvals: ApprovalsForAudioItem;
  currentVersionId: string | null;
  health: HealthSnapshotDetail | null;
}) {
  const openComments = threads.filter((t) => !t.isResolved).length;
  const openChangeRequests = changeRequests.filter((c) => c.status === "open").length;
  const currentStanding = currentVersionId ? approvals.currentStandingByVersion.get(currentVersionId) : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Approval state</p>
        <Badge className={`text-xs ${reviewStatusBadgeClass(review.status)}`} variant="outline">
          {REVIEW_STATUS_LABEL[review.status]}
        </Badge>
        {currentStanding && (
          <p className="mt-2 text-xs text-text-secondary">
            Last decision on the current version: <span className="font-medium">{currentStanding.decision.replace("_", " ")}</span> by{" "}
            {currentStanding.decidedByName}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Recording health</p>
        <HealthSummary health={health} />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Open items</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Open comments</span>
            <span className="font-medium text-ink-900">{openComments}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Open change requests</span>
            <span className="font-medium text-ink-900">{openChangeRequests}</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Participants</p>
        {participants.length === 0 ? (
          <p className="text-sm text-text-muted">No one has reviewed this yet.</p>
        ) : (
          <ul className="space-y-2">
            {participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">{p.avatarInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-800">{p.fullName}</p>
                  <p className="truncate text-[11px] text-text-muted">{p.roleAtTime.replaceAll("_", " ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">Latest activity</p>
        {latestActivity.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {latestActivity.slice(0, 5).map((event) => (
              <li key={event.id} className="text-xs">
                <p className="text-ink-800">
                  <span className="font-medium">{event.actorName}</span> · {event.action.replaceAll("_", " ")}
                </p>
                <p className="text-text-muted">{formatDateTime(event.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
