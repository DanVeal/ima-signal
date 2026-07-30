import Link from "next/link";
import { ArrowRight, ListTree } from "lucide-react";
import { getProjectById } from "@/lib/mock/queries";
import { PRAMS_PROJECT_ID, getPramsNeedsAttention, getPramsOverviewStats } from "@/lib/mock/prams-library";

const ATTENTION_PREVIEW_COUNT = 3;

/**
 * A bounded PRAMS risk summary for the dashboard — PRAMS has 100+ announcement
 * variants, far more than the Standard Radio review queue this dashboard is
 * built around, so its items are deliberately excluded from the main
 * attention feed (see queries.ts). This surfaces the same risk in a fixed,
 * small footprint instead of flooding that feed: three counts and a handful
 * of the highest-priority references, with a route into the full project.
 * Renders nothing when PRAMS has no outstanding action — scale alone is not
 * a reason to show up here.
 */
export function PramsDashboardSummary() {
  const project = getProjectById(PRAMS_PROJECT_ID);
  if (!project) return null;

  const stats = getPramsOverviewStats();
  const totalNeedsAction = stats.changesRequested + stats.missingAudio + stats.awaitingReview;
  if (totalNeedsAction === 0) return null;

  const { items } = getPramsNeedsAttention(ATTENTION_PREVIEW_COUNT);

  return (
    <div className="rounded-lg border border-signal-600/25 bg-signal-100/30 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListTree className="size-4 text-signal-600" strokeWidth={2.25} />
          <p className="text-sm font-semibold text-ink-900">{project.name}</p>
        </div>
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          Open PRAMS project
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-800">
        <span>
          <span className="font-semibold tabular-nums">{stats.changesRequested}</span> changes requested
        </span>
        <span>
          <span className="font-semibold tabular-nums">{stats.missingAudio}</span> missing audio
        </span>
        <span>
          <span className="font-semibold tabular-nums">{stats.awaitingReview}</span> awaiting review
        </span>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1 border-t border-signal-600/15 pt-3">
          {items.map((item) => (
            <li key={item.scriptId}>
              <Link
                href={`/projects/${project.id}/audio/${item.audioItemId}`}
                className="group flex items-center justify-between gap-3 text-sm text-ink-900 hover:text-brand"
              >
                <span className="truncate">{item.fullReference}</span>
                <span className="shrink-0 text-xs text-text-muted group-hover:text-brand">{item.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
