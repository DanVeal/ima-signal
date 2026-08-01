import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import type { ScriptPanelData } from "@/lib/review/queries";

/**
 * The intended script, laid out beside — never on top of — the recording.
 * Line numbers + preserved formatting + independent scroll so a long
 * script never pushes comments/activity out of reach. The `text-slot`
 * markup on each line is deliberately spare: a future transcription column
 * can sit directly beside `lines` (see getScriptLinesForAudioItem) without
 * this component needing a redesign.
 */
export function ScriptPanel({ data }: { data: ScriptPanelData }) {
  if (data.kind === "none" || data.lines.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No approved script yet"
        description="Once a script revision is approved for recording, it will appear here for side-by-side comparison against this audio."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <p className="text-xs font-medium text-text-secondary">
          {data.kind === "script_revision" ? `Revision ${data.revisionNumber}` : "PRAMS matrix wording"}
        </p>
        {data.kind === "script_revision" && (
          <Badge variant={data.isApprovedForRecording ? "default" : "outline"} className="text-[10px]">
            {data.isApprovedForRecording ? "Approved for recording" : "Not yet approved for recording"}
          </Badge>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <ol className="divide-y divide-border-subtle/60">
          {data.lines.map((line, index) => (
            <li key={index} className="flex gap-4 px-4 py-2.5">
              <span className="w-6 shrink-0 select-none text-right font-mono text-xs text-text-muted">
                {line.sortOrder + 1}
              </span>
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-wrap text-text-emphasis">
                {line.text ?? <span className="text-text-muted italic">— blank —</span>}
              </p>
            </li>
          ))}
        </ol>
      </div>
      {data.kind === "script_revision" && data.alts.length > 0 && (
        <div className="space-y-2 border-t border-border-subtle px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
            Alternate lines — after line {(data.anchorLineSortOrder ?? 0) + 1}, at most one used per recording
          </p>
          <ul className="space-y-2">
            {data.alts.map((alt) => (
              <li key={alt.label} className="rounded-md bg-surface-raised px-3 py-2">
                <p className="text-xs font-medium text-text-secondary">{alt.label}</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap text-text-emphasis">{alt.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
