import { cn } from "@/lib/utils";

/**
 * The recurring "signal" motif — a lit indicator used wherever something
 * needs a human's attention (dashboard, nav badges, status chips). Kept as
 * a single component so its meaning stays consistent everywhere it appears.
 */
export function SignalDot({
  size = "sm",
  active = true,
  className,
}: {
  size?: "sm" | "md";
  active?: boolean;
  className?: string;
}) {
  const dimension = size === "md" ? "size-2.5" : "size-1.5";
  return (
    <span className={cn("relative inline-flex", dimension, className)} aria-hidden="true">
      {active && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60",
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full",
          dimension,
          active ? "bg-signal" : "bg-ink-300",
        )}
      />
    </span>
  );
}
