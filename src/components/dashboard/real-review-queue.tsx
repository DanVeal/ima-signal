import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/layout/panel";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { ReviewQueueEntry } from "@/lib/dashboard/queries";

const REVIEW_STATUS_LABEL: Record<string, string> = {
  ready_for_review: "Ready for review",
  in_review: "In review",
};

function QueueRow({ item }: { item: ReviewQueueEntry }) {
  return (
    <Link
      href={`/projects/${item.audioItem.projectId}/recordings/${item.audioItem.audioItemId}`}
      className="group flex flex-col gap-3 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">{item.audioItem.label}</p>
        <p className="truncate text-xs text-text-muted">{item.audioItem.projectName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {REVIEW_STATUS_LABEL[item.status] ?? item.status}
        </Badge>
        <span className="text-xs text-text-muted">{formatDateTime(item.updatedAt)}</span>
      </div>
    </Link>
  );
}

/** Real reviews table (Phase 3.0) — replaces the mock attention/overdue lists with the same reviews/change_requests schema every other real page reads. See lib/dashboard/queries.ts's getReviewQueue. */
export function RealReviewQueue({ entries }: { entries: ReviewQueueEntry[] }) {
  const overdue = entries.filter((e) => e.overdue);
  const waiting = entries.filter((e) => !e.overdue);

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <Panel
          title="Overdue"
          description="Past their internal or client review deadline."
          className="border-critical/25"
        >
          <div className="-mx-5 -my-5">
            {overdue.map((item) => (
              <QueueRow key={item.reviewId} item={item} />
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Waiting on you" description="Not yet overdue.">
        {waiting.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Queue clear"
            description="Nothing is currently waiting on your review."
          />
        ) : (
          <div className="-mx-5 -my-5">
            {waiting.map((item) => (
              <QueueRow key={item.reviewId} item={item} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
