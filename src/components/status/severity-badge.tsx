import { OctagonAlert, TriangleAlert, Info, CircleHelp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DifferenceSeverity } from "@/types/domain";

const CONFIG: Record<
  DifferenceSeverity,
  { label: string; icon: LucideIcon; tone: string; border: string }
> = {
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    tone: "text-critical bg-critical-100",
    border: "border-critical/30",
  },
  important: {
    label: "Important",
    icon: TriangleAlert,
    tone: "text-important bg-important-100",
    border: "border-important/30",
  },
  minor: {
    label: "Minor",
    icon: Info,
    tone: "text-minor bg-minor-100",
    border: "border-minor/30",
  },
  uncertain: {
    label: "Possible transcription uncertainty",
    icon: CircleHelp,
    tone: "text-uncertain bg-uncertain-100",
    border: "border-uncertain/30 border-dashed",
  },
};

export function SeverityBadge({
  severity,
  className,
  compact = false,
}: {
  severity: DifferenceSeverity;
  className?: string;
  compact?: boolean;
}) {
  const config = CONFIG[severity];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        config.tone,
        config.border,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />
      {compact ? config.label.replace("Possible transcription uncertainty", "Uncertain") : config.label}
    </span>
  );
}
