import {
  FolderPlus,
  FileText,
  ShieldCheck,
  UploadCloud,
  GitBranch,
  MessageSquare,
  ClipboardEdit,
  CheckCheck,
  ArrowRightLeft,
  PackageCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/format";
import { getOrganisation, getUser } from "@/lib/mock/queries";
import type { ActivityAction, ActivityEvent } from "@/types/domain";

const ICON: Record<ActivityAction, LucideIcon> = {
  project_created: FolderPlus,
  project_edited: ClipboardEdit,
  user_invited: FolderPlus,
  script_created: FileText,
  script_approved: ShieldCheck,
  audio_uploaded: UploadCloud,
  audio_version_created: GitBranch,
  transcription_completed: FileText,
  qc_completed: FileText,
  comment_added: MessageSquare,
  change_request_created: ClipboardEdit,
  change_request_resolved: CheckCheck,
  status_changed: ArrowRightLeft,
  approval_decided: ShieldCheck,
  project_delivered: PackageCheck,
};

const VERB: Record<ActivityAction, string> = {
  project_created: "created the project",
  project_edited: "edited the project",
  user_invited: "invited a user",
  script_created: "created a script",
  script_approved: "approved a script for recording",
  audio_uploaded: "uploaded audio",
  audio_version_created: "uploaded a new version",
  transcription_completed: "completed transcription",
  qc_completed: "completed script comparison",
  comment_added: "added a comment",
  change_request_created: "requested a change",
  change_request_resolved: "resolved a change request",
  status_changed: "changed status",
  approval_decided: "recorded an approval decision",
  project_delivered: "marked the project as delivered",
};

export function ActivityList({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No activity yet"
        description="Actions taken on this project will build a full, readable history here."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const Icon = ICON[event.action];
        const actor = getUser(event.actorUserId);
        const org = getOrganisation(event.organisationId);
        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < events.length - 1 && (
              <span className="absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px bg-border-subtle" />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-500">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm text-ink-800">
                <span className="font-medium text-ink-900">{actor?.fullName ?? "Someone"}</span>{" "}
                {VERB[event.action]}{" "}
                <span className="font-medium text-ink-900">{event.entityLabel}</span>
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {org?.name} · {formatDateTime(event.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
