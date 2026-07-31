"use client";

import { useMemo, useState } from "react";
import { Columns2, Layers, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { FileText } from "lucide-react";
import { formatTimecode } from "@/lib/format";
import { CLASSIFICATION_BORDER_CLASS, CLASSIFICATION_CLASS, CLASSIFICATION_LABEL, type DiffClassification } from "./diff-classification";
import type { ScriptPanelData } from "@/lib/review/queries";
import type { ComparisonDetail, ComparisonFindingRow, PronunciationFindingRow, TranscriptDetail } from "@/lib/intelligence/queries";

type Mode = "side_by_side" | "overlay" | "diff";

const FILTERS: { value: "all" | "issues" | DiffClassification; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Issues only" },
  { value: "minor_wording", label: "Minor wording" },
  { value: "major_wording", label: "Major wording" },
  { value: "missing_phrase", label: "Missing" },
  { value: "additional_phrase", label: "Additional" },
  { value: "possible_pronunciation", label: "Pronunciation" },
  { value: "timing_issue", label: "Timing" },
  { value: "confidence_issue", label: "Confidence" },
];

const SEVERITY_RANK: Record<DiffClassification, number> = {
  missing_phrase: 0,
  major_wording: 1,
  possible_pronunciation: 2,
  minor_wording: 3,
  additional_phrase: 4,
  timing_issue: 5,
  confidence_issue: 6,
  perfect: 7,
};

function worstFinding(findings: ComparisonFindingRow[]): ComparisonFindingRow | null {
  if (findings.length === 0) return null;
  return [...findings].sort((a, b) => SEVERITY_RANK[a.classification] - SEVERITY_RANK[b.classification])[0];
}

export function TranscriptPanel({
  scriptData,
  transcript,
  comparison,
  pronunciationFindings,
  highlightedFindingId,
  onSelectFinding,
}: {
  scriptData: ScriptPanelData;
  transcript: TranscriptDetail | null;
  comparison: ComparisonDetail | null;
  pronunciationFindings: PronunciationFindingRow[];
  highlightedFindingId: string | null;
  onSelectFinding: (finding: ComparisonFindingRow) => void;
}) {
  const [mode, setMode] = useState<Mode>("side_by_side");
  const [filter, setFilter] = useState<"all" | "issues" | DiffClassification>("issues");

  const scriptLines = scriptData.kind === "script_revision" ? scriptData.lines : [];
  const findingsByLine = useMemo(() => {
    const map = new Map<number, ComparisonFindingRow[]>();
    for (const f of comparison?.findings ?? []) {
      if (f.scriptLineSortOrder == null) continue;
      const list = map.get(f.scriptLineSortOrder) ?? [];
      list.push(f);
      map.set(f.scriptLineSortOrder, list);
    }
    return map;
  }, [comparison]);

  const findingsBySegment = useMemo(() => {
    const map = new Map<string, ComparisonFindingRow[]>();
    for (const f of comparison?.findings ?? []) {
      if (!f.transcriptSegmentId) continue;
      const list = map.get(f.transcriptSegmentId) ?? [];
      list.push(f);
      map.set(f.transcriptSegmentId, list);
    }
    return map;
  }, [comparison]);

  const pronunciationBySegment = useMemo(() => {
    const map = new Map<string, PronunciationFindingRow[]>();
    for (const p of pronunciationFindings) {
      if (!p.transcriptSegmentId) continue;
      const list = map.get(p.transcriptSegmentId) ?? [];
      list.push(p);
      map.set(p.transcriptSegmentId, list);
    }
    return map;
  }, [pronunciationFindings]);

  if (scriptData.kind === "none" && !transcript) {
    return (
      <EmptyState
        icon={FileText}
        title="No script or transcript yet"
        description="Once a script revision is approved and a transcript is generated, they'll appear here side by side."
      />
    );
  }

  if (!transcript?.currentVersion || !comparison) {
    // No transcript, or a transcript exists but comparison hasn't run yet
    // (e.g. no approved script revision, or a PRAMS recording — comparison
    // currently supports Standard Radio only, see docs/intelligence-engine.md).
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-raised">
          <div className="border-b border-border-subtle px-4 py-2.5">
            <p className="text-xs font-medium text-text-secondary">Script</p>
          </div>
          <ol className="max-h-[360px] divide-y divide-border-subtle/60 overflow-y-auto">
            {scriptLines.map((line, i) => (
              <li key={i} className="flex gap-4 px-4 py-2.5">
                <span className="w-6 shrink-0 select-none text-right font-mono text-xs text-text-muted">{line.sortOrder + 1}</span>
                <p className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-800">{line.text}</p>
              </li>
            ))}
          </ol>
        </div>
        {transcript?.currentVersion ? (
          <div className="rounded-xl border border-border bg-surface-raised">
            <div className="border-b border-border-subtle px-4 py-2.5">
              <p className="text-xs font-medium text-text-secondary">
                Transcript {transcript.currentVersion.language ? `(${transcript.currentVersion.language})` : ""} — no comparison available yet
              </p>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-4">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink-800">{transcript.currentVersion.fullText}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No transcript yet — generate one to compare it against the script.</p>
        )}
      </div>
    );
  }

  const visibleFindings = comparison.findings.filter((f) => {
    if (filter === "all") return true;
    if (filter === "issues") return f.classification !== "perfect";
    return f.classification === filter;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-surface-sunken p-0.5">
          <Button size="xs" variant={mode === "side_by_side" ? "secondary" : "ghost"} onClick={() => setMode("side_by_side")}>
            <Columns2 className="size-3.5" /> Side by side
          </Button>
          <Button size="xs" variant={mode === "overlay" ? "secondary" : "ghost"} onClick={() => setMode("overlay")}>
            <Layers className="size-3.5" /> Overlay
          </Button>
          <Button size="xs" variant={mode === "diff" ? "secondary" : "ghost"} onClick={() => setMode("diff")}>
            <List className="size-3.5" /> Diff list
          </Button>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {Math.round(comparison.matchRatio * 100)}% wording match
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button key={f.value} size="xs" variant={filter === f.value ? "secondary" : "ghost"} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {mode === "side_by_side" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-raised">
            <div className="border-b border-border-subtle px-4 py-2.5">
              <p className="text-xs font-medium text-text-secondary">Script</p>
            </div>
            <ol className="max-h-[420px] divide-y divide-border-subtle/60 overflow-y-auto">
              {scriptLines.map((line, i) => {
                const lineFindings = (findingsByLine.get(line.sortOrder) ?? []).filter((f) =>
                  filter === "all" ? true : filter === "issues" ? f.classification !== "perfect" : f.classification === filter,
                );
                const worst = worstFinding(findingsByLine.get(line.sortOrder) ?? []);
                const isActive = lineFindings.some((f) => f.id === highlightedFindingId);
                return (
                  <li
                    key={i}
                    onClick={() => {
                      const target = lineFindings[0] ?? worst;
                      if (target) onSelectFinding(target);
                    }}
                    className={`flex gap-4 border-l-4 px-4 py-2.5 ${worst ? CLASSIFICATION_BORDER_CLASS[worst.classification] : "border-transparent"} ${
                      lineFindings.length > 0 ? "cursor-pointer hover:bg-surface-sunken" : ""
                    } ${isActive ? "bg-brand-100/15" : ""}`}
                  >
                    <span className="w-6 shrink-0 select-none text-right font-mono text-xs text-text-muted">{line.sortOrder + 1}</span>
                    <p className="min-w-0 flex-1 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-800">{line.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised">
            <div className="border-b border-border-subtle px-4 py-2.5">
              <p className="text-xs font-medium text-text-secondary">
                Transcript {transcript.currentVersion.language ? `(${transcript.currentVersion.language})` : ""}
              </p>
            </div>
            <ol className="max-h-[420px] divide-y divide-border-subtle/60 overflow-y-auto">
              {transcript.segments.map((segment) => {
                const segmentFindings = findingsBySegment.get(segment.id) ?? [];
                const worst = worstFinding(segmentFindings);
                const isActive = segmentFindings.some((f) => f.id === highlightedFindingId);
                const pronunciation = pronunciationBySegment.get(segment.id) ?? [];
                return (
                  <li
                    key={segment.id}
                    onClick={() => {
                      if (segmentFindings[0]) onSelectFinding(segmentFindings[0]);
                    }}
                    className={`flex gap-3 border-l-4 px-4 py-2.5 ${worst ? CLASSIFICATION_BORDER_CLASS[worst.classification] : "border-transparent"} ${
                      segmentFindings.length > 0 ? "cursor-pointer hover:bg-surface-sunken" : ""
                    } ${isActive ? "bg-brand-100/15" : ""}`}
                  >
                    <span className="w-12 shrink-0 select-none pt-0.5 font-mono text-[11px] text-text-muted">{formatTimecode(segment.startMs)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink-800">{segment.text}</p>
                      {pronunciation.length > 0 && (
                        <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                          Possible pronunciation: {pronunciation.map((p) => p.word).join(", ")}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      {mode === "overlay" && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-[15px] leading-loose whitespace-pre-wrap">
            {comparison.findings.map((f) => {
              const visible = filter === "all" || (filter === "issues" ? f.classification !== "perfect" : f.classification === filter);
              const text = f.transcriptText ?? f.scriptText ?? "";
              if (!text) return null;
              const isMissing = f.classification === "missing_phrase";
              return (
                <span
                  key={f.id}
                  onClick={() => onSelectFinding(f)}
                  className={`cursor-pointer rounded px-0.5 transition-colors ${
                    f.classification === "perfect" ? "text-ink-800" : CLASSIFICATION_CLASS[f.classification]
                  } ${isMissing ? "line-through decoration-red-400" : ""} ${highlightedFindingId === f.id ? "ring-2 ring-brand/50" : ""} ${
                    visible ? "" : "opacity-40"
                  }`}
                  title={CLASSIFICATION_LABEL[f.classification]}
                >
                  {text}{" "}
                </span>
              );
            })}
          </p>
        </div>
      )}

      {mode === "diff" && (
        <div className="space-y-2">
          {visibleFindings.length === 0 ? (
            <EmptyState icon={FileText} title="Nothing matches this filter" description="Try a different filter above." />
          ) : (
            visibleFindings.map((f) => (
              <div
                key={f.id}
                onClick={() => onSelectFinding(f)}
                className={`cursor-pointer rounded-xl border p-3 transition-colors hover:bg-surface-sunken ${
                  highlightedFindingId === f.id ? "border-brand/50 bg-brand-100/10" : "border-border bg-surface-raised"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${CLASSIFICATION_CLASS[f.classification]}`}>
                    {CLASSIFICATION_LABEL[f.classification]}
                  </Badge>
                  {f.startMs != null && <span className="font-mono text-[11px] text-text-muted">{formatTimecode(f.startMs)}</span>}
                  {f.confidence != null && <span className="text-[11px] text-text-muted">{Math.round(f.confidence * 100)}% confidence</span>}
                </div>
                {f.scriptText && (
                  <p className="text-sm text-ink-800">
                    <span className="text-text-muted">Script: </span>
                    {f.scriptText}
                  </p>
                )}
                {f.transcriptText && (
                  <p className="text-sm text-ink-800">
                    <span className="text-text-muted">Heard: </span>
                    {f.transcriptText}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
