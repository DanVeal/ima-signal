import type { Database } from "@/lib/supabase/database.types";

export type ReviewStatus = Database["public"]["Enums"]["review_status"];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  superseded: "Superseded",
  archived: "Archived",
};

type Tone = "neutral" | "info" | "warning" | "success" | "muted";

export const REVIEW_STATUS_TONE: Record<ReviewStatus, Tone> = {
  draft: "neutral",
  ready_for_review: "info",
  in_review: "info",
  changes_requested: "warning",
  approved: "success",
  superseded: "muted",
  archived: "muted",
};

const TONE_BADGE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-surface-raised text-ink-700",
  info: "border-brand/30 bg-brand-100/15 text-brand",
  warning:
    "border-amber-300/50 bg-amber-100/40 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300",
  success:
    "border-emerald-300/50 bg-emerald-100/40 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  muted: "border-border-subtle bg-surface-sunken text-text-muted",
};

export function reviewStatusBadgeClass(status: ReviewStatus): string {
  return TONE_BADGE_CLASS[REVIEW_STATUS_TONE[status]];
}
