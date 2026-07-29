import { AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function band(confidence: number): { label: string; tone: string } {
  if (confidence >= 0.85) return { label: "High confidence", tone: "text-success" };
  if (confidence >= 0.65) return { label: "Medium confidence", tone: "text-signal-600" };
  return { label: "Low confidence", tone: "text-critical" };
}

/**
 * Transcription confidence is how sure the speech-to-text engine is about
 * what it heard — it is NOT a measure of script accuracy. That's the
 * separate "script match" score. Every place this shows, we say so.
 */
export function ConfidenceIndicator({
  confidence,
  className,
}: {
  confidence: number;
  className?: string;
}) {
  const { label, tone } = band(confidence);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums",
              tone,
              className,
            )}
          />
        }
      >
        <AudioLines className="size-3.5" strokeWidth={2.25} />
        {label} · {Math.round(confidence * 100)}%
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        Reflects how confidently the speech-to-text engine understood this audio — not whether it
        matches the approved script. A low score means the words shown here may not be exactly
        what was said, and are worth a manual listen.
      </TooltipContent>
    </Tooltip>
  );
}
