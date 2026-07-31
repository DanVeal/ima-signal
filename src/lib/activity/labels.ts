import {
  Archive,
  ArrowRightLeft,
  Captions,
  Check,
  FileWarning,
  GitBranch,
  HeartPulse,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

/**
 * Every `activity_events.action` string in the system, mapped to a human
 * verb and an icon — shared by the recording-level timeline
 * (review-activity-timeline.tsx) and the dashboard's global activity feed
 * so producer language stays consistent in one place. See
 * docs/production-experience.md.
 */
export const ACTIVITY_ICON: Record<string, LucideIcon> = {
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
  transcript_requested: Captions,
  transcript_regenerated: Captions,
  transcript_completed: Captions,
  transcript_failed: FileWarning,
  comparison_generated: FileWarning,
  comparison_failed: FileWarning,
  health_generated: HeartPulse,
  health_failed: FileWarning,
  ai_job_cancelled: RotateCcw,
  ai_job_retried: RotateCcw,
};

export const ACTIVITY_VERB: Record<string, string> = {
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
  transcript_requested: "requested a transcript",
  transcript_regenerated: "regenerated the transcript",
  transcript_completed: "finished transcribing",
  transcript_failed: "hit an error transcribing",
  comparison_generated: "compared the script to the transcript",
  comparison_failed: "hit an error comparing the script",
  health_generated: "generated a recording health check",
  health_failed: "hit an error checking recording health",
  ai_job_cancelled: "cancelled an AI job",
  ai_job_retried: "retried an AI job",
};

export function activityVerb(action: string): string {
  return ACTIVITY_VERB[action] ?? action.replaceAll("_", " ");
}

export function activityIcon(action: string): LucideIcon {
  return ACTIVITY_ICON[action] ?? Archive;
}
