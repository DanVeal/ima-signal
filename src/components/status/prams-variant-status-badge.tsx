import { CheckCircle2, CircleDashed, Hourglass, MessageSquareWarning } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PramsVariantStatus } from "@/lib/mock/prams-library";

const CONFIG: Record<PramsVariantStatus, { label: string; icon: LucideIcon; tone: string }> = {
  missing_audio: { label: "Missing audio", icon: CircleDashed, tone: "text-ink-500 bg-ink-100" },
  awaiting_review: { label: "Awaiting review", icon: Hourglass, tone: "text-signal-600 bg-signal-100" },
  changes_requested: {
    label: "Changes requested",
    icon: MessageSquareWarning,
    tone: "text-important bg-important-100",
  },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-success bg-success-100" },
};

export function PramsVariantStatusBadge({
  status,
  className,
}: {
  status: PramsVariantStatus;
  className?: string;
}) {
  const config = CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.tone,
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
      {config.label}
    </span>
  );
}
