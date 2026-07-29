import { cn } from "@/lib/utils";
import { SignalDot } from "./signal-dot";

/**
 * TEMP_BRAND_MARK — placeholder wordmark. Swap for the official IMA
 * lockup when brand assets are supplied; every consumer of <Logo /> will
 * pick up the change automatically.
 */
export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const textSize = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2 font-display", textSize, className)}>
      <SignalDot size={size === "lg" ? "md" : "sm"} />
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold tracking-tight text-ink-900">IMA</span>
        <span className="italic font-normal text-brand">Signal</span>
      </span>
    </span>
  );
}
