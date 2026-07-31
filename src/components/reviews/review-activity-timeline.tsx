import {
  MessageSquare,
  Check,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  GitBranch,
  ArrowRightLeft,
  Archive,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/format";
import type { ReviewActivityEvent } from "@/lib/review/queries";

const ICON: Record<string, LucideIcon> = {
  audio_uploaded: UploadCloud,
  audio_version_created: GitBranch,
  audio_version_restored: RotateCcw,
  comment_added: MessageSquare,
  comment_edited: MessageSquare,
  comment_deleted: MessageSquare,
  comment_resolved: Check,
  comment_reopened: RotateCcw,
  approval_granted: ShieldCheck,
  approval_changes_requested: ShieldAlert,
  approval_withdrawn: RotateCcw,
  change_request_created: ShieldAlert,
  change_request_resolved: Check,
  change_request_cancelled: RotateCcw,
  review_status_changed: ArrowRightLeft,
};

const VERB: Record<string, string> = {
  audio_uploaded: "uploaded the recording",
  audio_version_created: "uploaded a new version",
  audio_version_restored: "restored an earlier version",
  comment_added: "commented",
  comment_edited: "edited a comment",
  comment_deleted: "deleted a comment",
  comment_resolved: "resolved a thread",
  comment_reopened: "reopened a thread",
  approval_granted: "approved this recording",
  approval_changes_requested: "requested changes",
  approval_withdrawn: "withdrew an approval decision",
  change_request_created: "opened a change request",
  change_request_resolved: "resolved a change request",
  change_request_cancelled: "cancelled a change request",
  review_status_changed: "changed the review status",
};

export function ReviewActivityTimeline({ events }: { events: ReviewActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No activity yet"
        description="Every upload, comment, and decision on this recording will build a full history here."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const Icon = ICON[event.action] ?? Archive;
        return (
          <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
            {index < events.length - 1 && (
              <span className="absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px bg-border-subtle" />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-500">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm text-ink-800">
                <span className="font-medium text-ink-900">{event.actorName}</span>{" "}
                {VERB[event.action] ?? event.action.replaceAll("_", " ")}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
