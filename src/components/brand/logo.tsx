import { cn } from "@/lib/utils";
import { ImaMark } from "./ima-mark";

/**
 * The real IMA mark (supplied directly, see ima-mark.tsx) paired with the
 * "Signal" product name in our own display type. IMA Signal is an IMA
 * product first — this lockup is deliberately IMA-only; the active client
 * workspace is shown separately (see <WorkspaceBadge />), never merged in.
 */
export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const markHeight = {
    sm: "h-4",
    md: "h-5",
    lg: "h-7",
  }[size];
  const textSize = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-[2rem]",
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ImaMark className={cn("w-auto text-text-primary", markHeight)} />
      <span className={cn("font-display italic font-normal text-brand", textSize)}>Signal</span>
    </span>
  );
}
