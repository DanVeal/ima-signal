import {
  CircleDashed,
  Mic,
  FileCheck2,
  Hourglass,
  MessageSquareWarning,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types/domain";

const CONFIG: Record<
  ProjectStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  draft_script: { label: "Draft script", icon: CircleDashed, tone: "text-ink-500 bg-ink-100" },
  ready_to_record: { label: "Ready to record", icon: FileCheck2, tone: "text-brand bg-brand-100" },
  studio_recording: { label: "Studio recording", icon: Mic, tone: "text-signal-600 bg-signal-100" },
  ready_for_ima_review: {
    label: "Ready for IMA review",
    icon: Hourglass,
    tone: "text-signal-600 bg-signal-100",
  },
  ima_changes_requested: {
    label: "IMA changes requested",
    icon: MessageSquareWarning,
    tone: "text-important bg-important-100",
  },
  ready_for_jet2_review: {
    label: "Ready for Jet2 review",
    icon: Hourglass,
    tone: "text-signal-600 bg-signal-100",
  },
  jet2_changes_requested: {
    label: "Jet2 changes requested",
    icon: MessageSquareWarning,
    tone: "text-important bg-important-100",
  },
  approved: { label: "Approved", icon: ShieldCheck, tone: "text-success bg-success-100" },
  delivered: { label: "Delivered", icon: PackageCheck, tone: "text-brand bg-brand-100" },
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
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
