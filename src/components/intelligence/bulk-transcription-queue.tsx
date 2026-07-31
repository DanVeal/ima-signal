"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StaticWaveform } from "@/components/audio/static-waveform";
import { formatDateTime, formatDuration, formatFileSize } from "@/lib/format";
import { requestBulkTranscription } from "@/lib/intelligence/actions";
import type { AiJobBatchStatus } from "@/lib/intelligence/queries";
import type { RecordingRow } from "@/lib/audio/queries";
import type { Database } from "@/lib/supabase/database.types";

type HealthRating = Database["public"]["Enums"]["health_rating"];

const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Transcript queued",
  processing: "Transcribing…",
  completed: "Transcribed",
  failed: "Transcript failed",
  cancelled: "Transcript cancelled",
};

const HEALTH_LABEL: Record<HealthRating, string> = {
  excellent: "Excellent",
  good: "Good",
  needs_review: "Needs review",
  attention_required: "Attention required",
};

const HEALTH_CLASS: Record<HealthRating, string> = {
  excellent: "border-emerald-300/50 text-emerald-700 dark:text-emerald-300",
  good: "border-brand/30 text-brand",
  needs_review: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  attention_required: "border-red-300/60 text-red-700 dark:text-red-300",
};

/**
 * The recordings browse page's bulk AI queue — "Allow multiple recordings
 * to enter an AI queue... Support hundreds of recordings." Selection +
 * one bulk request; the actual per-item work happens in the background
 * queue (src/lib/ai/worker.ts), not here.
 */
export function BulkTranscriptionQueue({
  projectId,
  rows,
  uploaders,
  jobStatusByVersionId,
  healthByVersionId,
  canGenerate,
}: {
  projectId: string;
  rows: RecordingRow[];
  uploaders: Map<string, { fullName: string; avatarInitials: string }>;
  jobStatusByVersionId: Map<string, AiJobBatchStatus>;
  healthByVersionId: Map<string, HealthRating>;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const withAudio = rows.filter((r) => r.currentVersion);
  const selectableIds = withAudio.map((r) => r.currentVersion!.id);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)));
  }

  async function handleBulkGenerate() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await requestBulkTranscription(Array.from(selected));
      setSelected(new Set());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {canGenerate && (
        <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-2">
          <Checkbox
            checked={selected.size > 0 && selected.size === selectableIds.length}
            onCheckedChange={toggleAll}
            disabled={selectableIds.length === 0}
          />
          <span className="text-xs text-text-secondary">
            {selected.size > 0 ? `${selected.size} selected` : `Select recordings to generate transcripts in bulk`}
          </span>
          <Button size="sm" className="ml-auto" disabled={selected.size === 0 || submitting} onClick={handleBulkGenerate}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Generate {selected.size > 0 ? `${selected.size} ` : ""}transcript{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const v = row.currentVersion;
          const uploader = v?.uploadedByUserId ? uploaders.get(v.uploadedByUserId) : undefined;
          const jobStatus = v ? jobStatusByVersionId.get(v.id) : undefined;
          const health = v ? healthByVersionId.get(v.id) : undefined;
          return (
            <div
              key={row.subjectId}
              className={`group flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 transition-colors ${
                row.audioItemId ? "hover:border-brand/40 hover:bg-brand-100/10" : "opacity-70"
              }`}
            >
              {canGenerate && v && (
                <Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggle(v.id)} onClick={(e) => e.stopPropagation()} />
              )}
              <Link
                href={row.audioItemId ? `/projects/${projectId}/recordings/${row.audioItemId}` : "#"}
                className="flex min-w-0 flex-1 items-center gap-4"
                aria-disabled={!row.audioItemId}
              >
                <div className="w-36 shrink-0">
                  <p className="truncate text-sm font-medium text-ink-900">{row.code}</p>
                  <p className="truncate text-xs text-text-muted">{row.label.replace(`${row.code} — `, "")}</p>
                </div>

                <div className="min-w-0 flex-1">
                  {v ? (
                    <StaticWaveform peaks={v.waveformPeaks} barClassName="bg-ink-300 group-hover:bg-brand/60 transition-colors" />
                  ) : (
                    <div className="flex h-8 items-center gap-2 text-xs text-text-muted">
                      <Mic className="size-3.5" />
                      No recording yet
                    </div>
                  )}
                </div>

                {v && (
                  <>
                    <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-text-secondary">
                      {v.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      v{v.versionNumber}
                    </Badge>
                    {health && (
                      <Badge variant="outline" className={`hidden shrink-0 text-[10px] sm:inline-flex ${HEALTH_CLASS[health]}`}>
                        {HEALTH_LABEL[health]}
                      </Badge>
                    )}
                    {jobStatus && !health && (
                      <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                        {jobStatus.status === "processing" && <Loader2 className="size-3 animate-spin" />}
                        {JOB_STATUS_LABEL[jobStatus.status] ?? jobStatus.status}
                      </Badge>
                    )}
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      {uploader && (
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">{uploader.avatarInitials}</AvatarFallback>
                        </Avatar>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs text-text-secondary">{uploader?.fullName ?? "Unknown"}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {formatDateTime(v.createdAt)} · {formatFileSize(v.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
