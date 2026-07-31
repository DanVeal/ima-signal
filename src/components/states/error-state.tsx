import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. The issue has been logged — please try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-critical/25 bg-critical-100 py-14 px-6 text-center",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-surface-raised text-critical">
        <AlertTriangle className="size-5" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-emphasis">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

export function PermissionDeniedState({
  title = "You don't have access to this",
  description = "This project is outside your current organisation's access. Contact your IMA producer if you believe this is a mistake.",
  className,
}: {
  title?: string;
  description?: string;
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
        <Lock className="size-5" strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-emphasis">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-text-muted">{description}</p>
      </div>
    </div>
  );
}
