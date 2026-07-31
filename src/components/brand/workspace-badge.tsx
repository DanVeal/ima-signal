import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Jet2Mark } from "./jet2-mark";

/**
 * The active client workspace, shown alongside the IMA wordmark — never
 * merged into it. IMA Signal stays an IMA product; Jet2 appears here only
 * as the current workspace context, deliberately smaller and secondary to
 * the main lockup.
 */
export function WorkspaceBadge({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "group flex items-center gap-1.5 rounded-md py-1 pl-1 pr-1.5 transition-colors hover:bg-ink-100",
        className,
      )}
    >
      <Jet2Mark className="h-3 w-auto" />
      <ChevronsUpDown className="size-3 text-ink-400 group-hover:text-text-secondary" />
    </button>
  );
}
