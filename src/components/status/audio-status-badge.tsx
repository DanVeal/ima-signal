import {
  UploadCloud,
  ListOrdered,
  AudioLines,
  ScanSearch,
  Hourglass,
  MessageSquareWarning,
  ShieldCheck,
  CircleX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudioVersionStatus } from "@/types/domain";

const CONFIG: Record<
  AudioVersionStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  uploaded: { label: "Uploaded", icon: UploadCloud, tone: "text-ink-500 bg-ink-100" },
  queued: { label: "Queued", icon: ListOrdered, tone: "text-ink-500 bg-ink-100" },
  transcribing: { label: "Transcribing", icon: AudioLines, tone: "text-brand bg-brand-100" },
  comparing: { label: "Comparing to script", icon: ScanSearch, tone: "text-brand bg-brand-100" },
  ready_for_ima_review: {
    label: "Awaiting IMA review",
    icon: Hourglass,
    tone: "text-signal-600 bg-signal-100",
  },
  ima_changes_requested: {
    label: "IMA changes requested",
    icon: MessageSquareWarning,
    tone: "text-important bg-important-100",
  },
  ready_for_jet2_review: {
    label: "Awaiting Jet2 review",
    icon: Hourglass,
    tone: "text-signal-600 bg-signal-100",
  },
  jet2_changes_requested: {
    label: "Jet2 changes requested",
    icon: MessageSquareWarning,
    tone: "text-important bg-important-100",
  },
  approved: { label: "Approved · locked", icon: ShieldCheck, tone: "text-success bg-success-100" },
  failed: { label: "Failed · retry required", icon: CircleX, tone: "text-critical bg-critical-100" },
};

export function AudioStatusBadge({
  status,
  className,
}: {
  status: AudioVersionStatus;
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
