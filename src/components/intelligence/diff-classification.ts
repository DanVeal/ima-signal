import type { Database } from "@/lib/supabase/database.types";

export type DiffClassification = Database["public"]["Enums"]["diff_classification"];

export const CLASSIFICATION_LABEL: Record<DiffClassification, string> = {
  perfect: "Perfect",
  minor_wording: "Minor wording",
  major_wording: "Major wording",
  missing_phrase: "Missing phrase",
  additional_phrase: "Additional phrase",
  possible_pronunciation: "Possible pronunciation",
  timing_issue: "Timing",
  confidence_issue: "Low confidence",
};

/** Quiet, restrained palette — no red/green traffic-lighting on every word. Only 'missing_phrase' and 'major_wording' use a warmer tone; everything else stays in slate/violet/amber so the page doesn't read as an alarm panel. */
export const CLASSIFICATION_CLASS: Record<DiffClassification, string> = {
  perfect: "border-transparent text-ink-800",
  minor_wording: "border-amber-300/50 bg-amber-100/30 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300",
  major_wording: "border-orange-300/60 bg-orange-100/30 text-orange-800 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-300",
  missing_phrase: "border-red-300/60 bg-red-100/30 text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300",
  additional_phrase: "border-violet-300/60 bg-violet-100/30 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300",
  possible_pronunciation: "border-violet-300/60 bg-violet-100/30 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300",
  timing_issue: "border-slate-300/60 bg-slate-100/40 text-slate-700 dark:border-slate-400/30 dark:bg-slate-500/10 dark:text-slate-300",
  confidence_issue: "border-border-subtle bg-surface-sunken text-text-muted",
};

export const CLASSIFICATION_BORDER_CLASS: Record<DiffClassification, string> = {
  perfect: "border-transparent",
  minor_wording: "border-amber-400/70",
  major_wording: "border-orange-400/70",
  missing_phrase: "border-red-400/70",
  additional_phrase: "border-violet-400/70",
  possible_pronunciation: "border-violet-400/70",
  timing_issue: "border-slate-400/70",
  confidence_issue: "border-border",
};

export function isIssueClassification(classification: DiffClassification): boolean {
  return classification !== "perfect";
}
