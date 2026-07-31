import { FileText } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { formatDateTime } from "@/lib/format";
import { activityIcon, activityVerb } from "@/lib/activity/labels";
import type { ReviewActivityEvent } from "@/lib/review/queries";

export function ReviewActivityTimeline({ events }: { events: ReviewActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No activity yet"
        description="Every upload, comment, and decision on this recording will build a full history here."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const Icon = activityIcon(event.action);
        return (
          <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
            {index < events.length - 1 && (
              <span className="absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px bg-border-subtle" />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-ink-500">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm text-text-emphasis">
                <span className="font-medium text-text-primary">{event.actorName}</span>{" "}
                {activityVerb(event.action)}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(event.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
