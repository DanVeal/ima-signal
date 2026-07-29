import { CalendarClock, CircleAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDeadlineStatus } from "@/lib/format";

const TONE = {
  overdue: "text-critical bg-critical-100",
  "due-soon": "text-signal-600 bg-signal-100",
  "on-track": "text-ink-600 bg-ink-100",
};

const ICON = {
  overdue: CircleAlert,
  "due-soon": CalendarClock,
  "on-track": CheckCircle2,
};

export function DeadlineBadge({ date, className }: { date: string; className?: string }) {
  const status = getDeadlineStatus(date);
  const Icon = ICON[status.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        TONE[status.tone],
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
      {status.label}
    </span>
  );
}
