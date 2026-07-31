"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { AiJobSummary } from "@/lib/intelligence/queries";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<string, string> = {
  queued: "border-border text-text-muted",
  processing: "border-brand/30 bg-brand-100/15 text-brand",
  completed: "border-emerald-300/50 text-emerald-700 dark:text-emerald-300",
  failed: "border-red-300/60 text-red-700 dark:text-red-300",
  cancelled: "border-border-subtle text-text-muted",
};

/**
 * A quiet status line, not a feature announcement — "AI should feel
 * quiet. No glowing robots. No magic sparkle icons." The one Sparkles
 * icon here is small, monochrome, and only appears on the idle "Generate
 * transcript" action itself, never on results.
 */
export function AiJobStatus({
  transcriptionJob,
  canGenerate,
  onGenerate,
  onRetry,
  onCancel,
}: {
  transcriptionJob: AiJobSummary | null;
  canGenerate: boolean;
  onGenerate: () => Promise<void>;
  onRetry: (jobId: string) => Promise<void>;
  onCancel: (jobId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  if (!transcriptionJob || transcriptionJob.status === "cancelled") {
    if (!canGenerate) return null;
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(onGenerate)}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Generate transcript
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={STATUS_CLASS[transcriptionJob.status]}>
        {transcriptionJob.status === "processing" && <Loader2 className="size-3 animate-spin" />}
        Transcript {STATUS_LABEL[transcriptionJob.status].toLowerCase()}
      </Badge>
      {transcriptionJob.status === "failed" && transcriptionJob.lastError && (
        <span className="max-w-64 truncate text-xs text-text-muted" title={transcriptionJob.lastError}>
          {transcriptionJob.lastError}
        </span>
      )}
      {canGenerate && transcriptionJob.status === "failed" && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => run(() => onRetry(transcriptionJob.id))}>
          <RotateCcw className="size-3" /> Retry
        </Button>
      )}
      {canGenerate && transcriptionJob.status === "queued" && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => run(() => onCancel(transcriptionJob.id))}>
          <X className="size-3" /> Cancel
        </Button>
      )}
      {canGenerate && transcriptionJob.status === "completed" && (
        <Button size="xs" variant="ghost" disabled={busy} onClick={() => run(onGenerate)}>
          <RotateCcw className="size-3" /> Regenerate
        </Button>
      )}
      <span className="text-[11px] text-text-muted">{formatDateTime(transcriptionJob.createdAt)}</span>
    </div>
  );
}
