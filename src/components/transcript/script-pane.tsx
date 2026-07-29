import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { QcDifference } from "@/types/domain";

const SEVERITY_CLASS: Record<QcDifference["severity"], string> = {
  critical: "decoration-critical bg-critical-100",
  important: "decoration-important bg-important-100",
  minor: "decoration-minor bg-minor-100",
  uncertain: "decoration-uncertain bg-uncertain-100 decoration-dotted",
};

interface Mark {
  start: number;
  end: number;
  diff: QcDifference;
}

function buildMarks(body: string, differences: QcDifference[]): Mark[] {
  const marks: Mark[] = [];
  for (const diff of differences) {
    if (!diff.expectedText) continue;
    const index = body.toLowerCase().indexOf(diff.expectedText.toLowerCase());
    if (index === -1) continue;
    marks.push({ start: index, end: index + diff.expectedText.length, diff });
  }
  return marks.sort((a, b) => a.start - b.start);
}

export function ScriptPane({
  body,
  differences,
}: {
  body: string;
  differences: QcDifference[];
}) {
  const marks = buildMarks(body, differences);
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  marks.forEach((mark, i) => {
    if (mark.start < cursor) return; // skip overlapping mark
    if (mark.start > cursor) {
      segments.push(<span key={`text-${i}`}>{body.slice(cursor, mark.start)}</span>);
    }
    segments.push(
      <Tooltip key={`mark-${i}`}>
        <TooltipTrigger
          render={
            <mark
              className={cn(
                "rounded px-0.5 py-0.5 underline decoration-2 underline-offset-4",
                SEVERITY_CLASS[mark.diff.severity],
              )}
            />
          }
        >
          {body.slice(mark.start, mark.end)}
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">
          Recorded as &ldquo;{mark.diff.actualText}&rdquo; — {mark.diff.type.replace(/_/g, " ")}
        </TooltipContent>
      </Tooltip>,
    );
    cursor = mark.end;
  });
  segments.push(<span key="tail">{body.slice(cursor)}</span>);

  return (
    <p className="text-[14px] leading-[1.85] text-text-secondary" aria-label="Approved script">
      {segments}
    </p>
  );
}
