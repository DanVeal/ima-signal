import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Section } from "@/components/nav/page-container";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import type { AiQueueItem, AttentionItem, ReviewAwaitingApproval, UpcomingDelivery } from "@/lib/dashboard/queries";

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "border-red-300/60 text-red-700 dark:text-red-300",
  high: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  medium: "border-border text-text-secondary",
  low: "border-border text-text-muted",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
  ready_for_review: "Ready for review",
  in_review: "In review",
};

const HEALTH_RATING_LABEL: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_review: "Needs review",
  attention_required: "Attention required",
};

const HEALTH_RATING_DOT: Record<string, string> = {
  excellent: "bg-emerald-500",
  good: "bg-brand",
  needs_review: "bg-amber-500",
  attention_required: "bg-red-500",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  transcription: "Transcribing",
  comparison: "Comparing to script",
  health: "Checking health",
};

/**
 * The real Home dashboard "control room" (Phase 3.0) — everything here is a
 * live query against the same schema every other real page reads (see
 * lib/dashboard/queries.ts), prioritised by what's actually actionable:
 * Needs Attention, Reviews Awaiting Approval, AI Processing Queue, Recording
 * Health, Upcoming Deliveries, then Recent Activity. No mock data.
 */
export async function ControlRoom() {
  const supabase = await createClient();
  const overview = await getDashboardOverview(supabase);
  const { changeRequests, reviewsAwaitingApproval, aiQueue, health, upcomingDeliveries, recentActivity } = overview;

  const totalNeedingAttention = changeRequests.total;
  const headline =
    totalNeedingAttention === 0
      ? "You're all clear"
      : totalNeedingAttention === 1
        ? "1 recording needs your attention"
        : `${totalNeedingAttention} recordings need your attention`;
  const subline =
    totalNeedingAttention === 0
      ? "No open change requests right now — new ones will land here the moment someone raises one."
      : "Open change requests, ranked by most recent.";

  return (
    <div className="space-y-12">
      <div>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">{headline}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">{subline}</p>
      </div>

      <Section title="Needs attention" description="Open change requests across every project you can access.">
        <AttentionList items={changeRequests.items} />
      </Section>

      <Section
        title="Awaiting approval"
        description="Reviews with a decision still outstanding."
        href="/review-queue"
      >
        <ReviewsAwaitingList items={reviewsAwaitingApproval.items} />
      </Section>

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
        <Section
          title="AI processing queue"
          description={`${aiQueue.total} job${aiQueue.total === 1 ? "" : "s"} queued or running.`}
        >
          <AiQueueList items={aiQueue.items} />
        </Section>

        <Section title="Recording health" description="A summary of AI findings — never a verdict.">
          <HealthOverview counts={health.counts} needsAttention={health.needsAttention} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
        <Section title="Upcoming deliveries" description="Projects sorted by their nearest deadline.">
          <UpcomingDeliveriesList items={upcomingDeliveries} />
        </Section>

        <Section title="Recent activity" description="Every upload, comment, and decision, most recent first." href="/activity">
          <ActivityFeed
            events={recentActivity.map((e) => ({ ...e, subtitle: e.projectName || undefined }))}
            emptyDescription="Every upload, comment, and decision across your projects will build a history here."
          />
        </Section>
      </div>
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={CheckCircle2} title="Signal clear" description="Nothing needs your review right now." />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/projects/${item.audioItem.projectId}/recordings/${item.audioItem.audioItemId}`}
          className="flex items-center gap-4 border-b border-border-subtle px-4 py-3 transition-colors last:border-b-0 hover:bg-ink-50"
        >
          <ShieldAlert className="size-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{item.audioItem.label}</p>
            <p className="truncate text-xs text-text-muted">
              {item.audioItem.projectName} · {item.message}
            </p>
          </div>
          <Badge variant="outline" className={`shrink-0 text-xs ${PRIORITY_CLASS[item.priority] ?? PRIORITY_CLASS.medium}`}>
            {item.priority}
          </Badge>
          <span className="w-32 shrink-0 text-right text-xs text-text-muted">{formatDateTime(item.createdAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function ReviewsAwaitingList({ items }: { items: ReviewAwaitingApproval[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Nothing waiting on a decision"
        description="Reviews will appear here as soon as they're ready for approval."
      />
    );
  }
  return (
    <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
      {items.map((item) => (
        <li key={item.reviewId}>
          <Link
            href={`/projects/${item.audioItem.projectId}/recordings/${item.audioItem.audioItemId}`}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{item.audioItem.label}</p>
              <p className="truncate text-xs text-text-muted">{item.audioItem.projectName}</p>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs">
              {REVIEW_STATUS_LABEL[item.status] ?? item.status}
            </Badge>
            <span className="w-32 shrink-0 text-right text-xs text-text-muted">{formatDateTime(item.updatedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AiQueueList({ items }: { items: AiQueueItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing running"
        description="Generate a transcript from any recording and it'll show up here while it works."
        className="py-10"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.jobId}>
          <Link
            href={`/projects/${item.audioItem.projectId}/recordings/${item.audioItem.audioItemId}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-2.5 transition-colors hover:border-brand/40"
          >
            {item.status === "processing" ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
            ) : (
              <span className="size-2 shrink-0 rounded-full bg-ink-300" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{item.audioItem.label}</p>
              <p className="truncate text-xs text-text-muted">{item.audioItem.projectName}</p>
            </div>
            <span className="shrink-0 text-xs text-text-secondary">{JOB_TYPE_LABEL[item.jobType] ?? item.jobType}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HealthOverview({
  counts,
  needsAttention,
}: {
  counts: Record<string, number>;
  needsAttention: { audioItemId: string; projectId: string; projectName: string; label: string; rating: string }[];
}) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={HeartPulse}
        title="No health checks yet"
        description="Recording health appears once a transcript has been generated and compared to the script."
        className="py-10"
      />
    );
  }
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2">
        {Object.entries(counts).map(([rating, count]) => (
          <li key={rating} className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
            <span className={`size-2 shrink-0 rounded-full ${HEALTH_RATING_DOT[rating]}`} />
            <span className="text-sm font-medium text-ink-900 tabular-nums">{count}</span>
            <span className="truncate text-xs text-text-muted">{HEALTH_RATING_LABEL[rating]}</span>
          </li>
        ))}
      </ul>
      {needsAttention.length > 0 && (
        <ul className="space-y-1.5">
          {needsAttention.map((item) => (
            <li key={item.audioItemId}>
              <Link
                href={`/projects/${item.projectId}/recordings/${item.audioItemId}`}
                className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-50"
              >
                <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{item.label}</span>
                <span className="shrink-0 text-xs text-text-muted">{HEALTH_RATING_LABEL[item.rating]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpcomingDeliveriesList({ items }: { items: UpcomingDelivery[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        description="Deadlines from every active project will show up here."
        className="py-10"
      />
    );
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={item.projectId}>
          <Link
            href={`/projects/${item.projectId}`}
            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-ink-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">{item.projectName}</span>
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <CalendarClock className="size-3" />
                {item.nextDeadlineLabel}
              </span>
            </span>
            <DeadlineBadge date={item.nextDeadline} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

