import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 px-6 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-emphasis">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
