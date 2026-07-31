"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InlineError } from "@/components/states/inline-error";
import { formatDateTime, formatDuration, formatFileSize } from "@/lib/format";
import { restoreAudioVersion } from "@/lib/audio-upload/actions";
import type { RecordingVersionSummary } from "@/lib/audio/queries";

interface Uploader {
  fullName: string;
  avatarInitials: string;
}

export function VersionHistory({
  versions,
  currentVersionId,
  uploaders,
}: {
  versions: RecordingVersionSummary[];
  currentVersionId: string | null;
  uploaders: Map<string, Uploader>;
}) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(versionId: string) {
    setRestoringId(versionId);
    setError(null);
    try {
      await restoreAudioVersion(versionId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <InlineError message={error} />}
      {versions.map((v) => {
        const isCurrent = v.id === currentVersionId;
        const uploader = v.uploadedByUserId ? uploaders.get(v.uploadedByUserId) : undefined;
        return (
          <div
            key={v.id}
            className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
              isCurrent ? "border-brand/40 bg-brand-100/10" : "border-border bg-surface-raised"
            }`}
          >
            <Badge variant={isCurrent ? "default" : "outline"} className="shrink-0">
              v{v.versionNumber}
            </Badge>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">
                {v.originalFilename}
                {v.restoredFromVersionId && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-text-muted">
                    <History className="size-3" />
                    restored
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-text-muted">
                {v.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"} · {formatFileSize(v.fileSizeBytes)}
                {v.codec ? ` · ${v.codec}` : ""}
                {v.sampleRateHz ? ` · ${(v.sampleRateHz / 1000).toFixed(1)}kHz` : ""}
              </p>
            </div>

            <div className="flex w-40 shrink-0 items-center gap-2">
              {uploader && (
                <Avatar className="size-6">
                  <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">
                    {uploader.avatarInitials}
                  </AvatarFallback>
                </Avatar>
              )}
              <p className="truncate text-xs text-text-muted">{formatDateTime(v.createdAt)}</p>
            </div>

            {isCurrent ? (
              <span className="shrink-0 text-xs font-medium text-brand">Current</span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={restoringId !== null}
                onClick={() => handleRestore(v.id)}
              >
                {restoringId === v.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Restore
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
