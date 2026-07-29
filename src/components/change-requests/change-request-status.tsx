import {
  CircleDot,
  BadgeCheck,
  Loader,
  PackageCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChangeRequestStatus } from "@/types/domain";

const CONFIG: Record<
  ChangeRequestStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  open: { label: "Open", icon: CircleDot, tone: "text-signal-600 bg-signal-100" },
  acknowledged: { label: "Acknowledged", icon: BadgeCheck, tone: "text-brand bg-brand-100" },
  in_progress: { label: "In progress", icon: Loader, tone: "text-brand bg-brand-100" },
  addressed_in_new_version: {
    label: "Addressed in new version",
    icon: PackageCheck,
    tone: "text-success bg-success-100",
  },
  resolved: { label: "Resolved", icon: CheckCircle2, tone: "text-success bg-success-100" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-ink-500 bg-ink-100" },
  reopened: { label: "Reopened", icon: RotateCcw, tone: "text-important bg-important-100" },
};

export function ChangeRequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
  const config = CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.tone,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
      {config.label}
    </span>
  );
}
