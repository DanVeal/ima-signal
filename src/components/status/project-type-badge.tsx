import { Radio, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/types/domain";

const CONFIG: Record<ProjectType, { label: string; icon: typeof Radio; tone: string }> = {
  standard_radio: { label: "Standard Radio", icon: Radio, tone: "text-brand bg-brand-100" },
  prams: { label: "PRAMS", icon: ListTree, tone: "text-signal-600 bg-signal-100" },
};

export function ProjectTypeBadge({ type, className }: { type: ProjectType; className?: string }) {
  const config = CONFIG[type];
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
