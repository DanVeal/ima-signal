import { Activity as ActivityIcon } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { activityIcon, activityVerb } from "@/lib/activity/labels";
import { formatDateTime } from "@/lib/format";

export interface ActivityFeedItem {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  /** Shown after the verb, e.g. a project name — omit when the surrounding page already makes that obvious (a single project's own Activity tab). */
  subtitle?: string;
}

/** Shared feed renderer for both the dashboard's cross-project activity and a single project's Activity tab — one source of truth for producer-facing activity language (see lib/activity/labels.ts). */
export function ActivityFeed({
  events,
  emptyDescription,
}: {
  events: ActivityFeedItem[];
  emptyDescription: string;
}) {
  if (events.length === 0) {
    return <EmptyState icon={ActivityIcon} title="No activity yet" description={emptyDescription} className="py-10" />;
  }
  return (
    <ul className="space-y-3">
      {events.map((event) => {
        const Icon = activityIcon(event.action);
        return (
          <li key={event.id} className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-500">
              <Icon className="size-3.5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-800">
                <span className="font-medium text-ink-900">{event.actorName}</span> {activityVerb(event.action)}
                {event.subtitle && <span className="text-text-muted"> · {event.subtitle}</span>}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
