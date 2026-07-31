import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared inline error row for a failed client-side action (a mutation, a fetch) — not a full page error, see error.tsx for that. */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-sm text-critical", className)}>
      <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
      {message}
    </p>
  );
}
