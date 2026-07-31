"use client";

import { useCallback, useRef, useState } from "react";
import {
  UploadCloud,
  FileAudio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Loader2,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBulkUpload, type UploadRow, type UploadRowStatus } from "@/lib/audio-upload/use-bulk-upload";
import type { MatchTarget } from "@/lib/audio-upload/matcher";
import { formatFileSize } from "@/lib/format";

const STATUS_CONFIG: Record<UploadRowStatus, { label: string; className: string }> = {
  hashing: { label: "Checking…", className: "text-text-muted" },
  matched: { label: "Ready", className: "text-text-secondary" },
  queued: { label: "Queued", className: "text-text-muted" },
  uploading: { label: "Uploading", className: "text-brand" },
  processing: { label: "Processing", className: "text-brand" },
  done: { label: "Done", className: "text-success" },
  error: { label: "Failed", className: "text-critical" },
  canceled: { label: "Canceled", className: "text-text-muted" },
};

function MatchBadge({ row }: { row: UploadRow }) {
  if (!row.match) return null;
  switch (row.match.status) {
    case "matched":
      if (row.match.isDuplicate || row.match.isDuplicateInBatch) {
        return (
          <Badge variant="outline" className="border-important text-important">
            <AlertTriangle className="size-3" /> Duplicate
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="border-success text-success">
          <CheckCircle2 className="size-3" /> {row.match.target?.code}
        </Badge>
      );
    case "ambiguous":
      return (
        <Badge variant="outline" className="border-important text-important">
          <AlertTriangle className="size-3" /> Ambiguous
        </Badge>
      );
    case "unknown_reference":
      return (
        <Badge variant="outline" className="border-important text-important">
          <HelpCircle className="size-3" /> Unknown reference
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-text-muted">
          <XCircle className="size-3" /> Unmatched
        </Badge>
      );
  }
}

export function UploadWorkflow({ targets }: { targets: MatchTarget[] }) {
  const { rows, matchSummary, addFiles, removeRow, startImport, retry, cancel } = useBulkUpload(targets);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void addFiles(files);
    },
    [addFiles],
  );

  const hasStarted = rows.some((r) => r.status !== "matched" && r.status !== "hashing");
  const canImport = matchSummary.readyToImport > 0 && !hasStarted;

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragging ? "border-brand bg-brand-100/20" : "border-border-strong hover:border-brand/40"
        }`}
      >
        <UploadCloud className="size-8 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Drag and drop audio files, or click to browse</p>
        <p className="text-xs text-text-muted">
          WAV, MP3, AAC, FLAC — filenames are matched against variant/reference codes automatically.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void addFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm">
            <SummaryStat label="Matched" value={matchSummary.matched} />
            <SummaryStat label="Ready to import" value={matchSummary.readyToImport} tone="success" />
            <SummaryStat label="Unmatched" value={matchSummary.unmatched} />
            <SummaryStat label="Ambiguous" value={matchSummary.ambiguous} tone={matchSummary.ambiguous > 0 ? "warning" : undefined} />
            <SummaryStat label="Unknown reference" value={matchSummary.unknownReference} tone={matchSummary.unknownReference > 0 ? "warning" : undefined} />
            <SummaryStat label="Duplicates" value={matchSummary.duplicates} tone={matchSummary.duplicates > 0 ? "warning" : undefined} />
            <div className="ml-auto">
              <Button onClick={() => startImport()} disabled={!canImport}>
                <UploadCloud className="size-4" />
                Import {matchSummary.readyToImport} file{matchSummary.readyToImport === 1 ? "" : "s"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {rows.map((row) => (
              <UploadFileRow key={row.id} row={row} onRemove={removeRow} onRetry={retry} onCancel={cancel} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${
          tone === "success" ? "text-success" : tone === "warning" ? "text-important" : "text-text-primary"
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

function UploadFileRow({
  row,
  onRemove,
  onRetry,
  onCancel,
}: {
  row: UploadRow;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const status = STATUS_CONFIG[row.status];
  const isActive = row.status === "uploading" || row.status === "processing" || row.status === "queued";
  const willBeSkipped =
    row.status === "matched" &&
    row.match &&
    (row.match.status !== "matched" || row.match.isDuplicate || row.match.isDuplicateInBatch);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <FileAudio className="size-4 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{row.fileName}</p>
        <p className="truncate text-xs text-text-muted">
          {formatFileSize(row.fileSizeBytes)}
          {row.match && row.match.warnings.length > 0 && (
            <span className="ml-2 text-important">{row.match.warnings.join(" · ")}</span>
          )}
        </p>
      </div>

      <MatchBadge row={row} />

      <div className="w-28 shrink-0">
        {row.status === "uploading" ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div className="h-full bg-brand transition-all" style={{ width: `${row.progress}%` }} />
          </div>
        ) : (
          <span className={`flex items-center gap-1 text-xs font-medium ${willBeSkipped ? "text-text-muted" : status.className}`}>
            {(row.status === "processing" || row.status === "hashing" || row.status === "queued") && (
              <Loader2 className="size-3 animate-spin" />
            )}
            {row.status === "done" && <CheckCircle2 className="size-3" />}
            {willBeSkipped ? "Won't import" : status.label}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isActive && (
          <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => onCancel(row.id)}>
            <X className="size-3.5" />
          </Button>
        )}
        {row.status === "error" && (
          <Button variant="ghost" size="icon-sm" aria-label="Retry" onClick={() => onRetry(row.id)}>
            <RotateCcw className="size-3.5" />
          </Button>
        )}
        {(row.status === "matched" || row.status === "canceled" || row.status === "error") && (
          <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => onRemove(row.id)}>
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
