import { Badge } from "@/components/ui/badge";
import type { HealthSnapshotDetail } from "@/lib/intelligence/queries";

const RATING_LABEL: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_review: "Needs review",
  attention_required: "Attention required",
};

const RATING_CLASS: Record<string, string> = {
  excellent: "border-emerald-300/50 text-emerald-700 dark:text-emerald-300",
  good: "border-brand/30 text-brand",
  needs_review: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  attention_required: "border-red-300/60 text-red-700 dark:text-red-300",
};

const CATEGORY_LABEL: Record<string, string> = {
  transcript_match: "Transcript match",
  pronunciation: "Pronunciation",
  timing: "Timing",
  noise_detection: "Noise detection",
  confidence: "Confidence",
  completeness: "Completeness",
};

/**
 * A summary of findings, never a verdict — "Health summarises findings.
 * It never replaces human judgement." Restrained by design: text and a
 * small dot, no gauges, no scores out of 100, no colour-drenched cards.
 */
export function HealthSummary({ health }: { health: HealthSnapshotDetail | null }) {
  if (!health) {
    return <p className="text-sm text-text-muted">No recording health summary yet.</p>;
  }

  return (
    <div className="space-y-3">
      <Badge variant="outline" className={`text-xs ${RATING_CLASS[health.overallRating]}`}>
        {RATING_LABEL[health.overallRating]}
      </Badge>
      <ul className="space-y-1.5">
        {health.categoryScores.map((score) => (
          <li key={score.category} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-1 size-1.5 shrink-0 rounded-full ${
                score.rating === "excellent"
                  ? "bg-emerald-500"
                  : score.rating === "good"
                    ? "bg-brand"
                    : score.rating === "needs_review"
                      ? "bg-amber-500"
                      : "bg-red-500"
              }`}
            />
            <div className="min-w-0">
              <p className="font-medium text-text-emphasis">{CATEGORY_LABEL[score.category]}</p>
              <p className="text-text-muted">{score.summary}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
