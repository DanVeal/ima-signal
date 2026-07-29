import type { CommentCategory } from "@/types/domain";

export const CATEGORY_LABEL: Record<CommentCategory, string> = {
  wording: "Wording",
  replacement_copy: "Replacement copy",
  performance: "Performance",
  pacing: "Pacing",
  timing: "Timing",
  music_sound: "Music or sound",
  technical_issue: "Technical issue",
  general: "General feedback",
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({
  value: value as CommentCategory,
  label,
}));
