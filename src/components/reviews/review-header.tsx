"use client";

import { useState } from "react";
import { Archive, Loader2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDateTime, formatDuration, formatFileSize } from "@/lib/format";
import { reviewStatusBadgeClass, REVIEW_STATUS_LABEL } from "./review-status";
import { ApprovalActions } from "./approval-actions";
import type { ReviewSummary } from "@/lib/review/queries";
import type { RecordingVersionSummary } from "@/lib/audio/queries";
import type { ApprovalDecision } from "@/lib/review/service";

export function ReviewHeader({
  label,
  currentVersion,
  uploaderName,
  review,
  canDecide,
  isManager,
  currentDecision,
  onDecide,
  onWithdraw,
  onStartReview,
  onArchiveReview,
}: {
  label: string;
  currentVersion: RecordingVersionSummary | null;
  uploaderName: string | null;
  review: ReviewSummary;
  canDecide: boolean;
  isManager: boolean;
  currentDecision: "approved" | "changes_requested" | "withdrawn" | null;
  onDecide: (decision: ApprovalDecision, note?: string) => Promise<void>;
  onWithdraw: (note?: string) => Promise<void>;
  onStartReview: () => Promise<void>;
  onArchiveReview: () => Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<"start" | "archive" | null>(null);

  return (
    <div className="mb-8 flex flex-col gap-5 border-b border-border-subtle pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-brand uppercase">Recording · Review</p>
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">{label}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
          {currentVersion && (
            <>
              <Badge variant="outline">v{currentVersion.versionNumber}</Badge>
              <span>{currentVersion.durationSeconds != null ? formatDuration(currentVersion.durationSeconds) : "—"}</span>
              <span>{formatFileSize(currentVersion.fileSizeBytes)}</span>
            </>
          )}
          <Badge variant="outline" className={reviewStatusBadgeClass(review.status)}>
            {REVIEW_STATUS_LABEL[review.status]}
          </Badge>
          {uploaderName && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar className="size-5">
                <AvatarFallback className="bg-ink-100 text-[9px] font-medium text-ink-700">
                  {uploaderName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {uploaderName}
            </span>
          )}
          {currentVersion && <span>{formatDateTime(currentVersion.createdAt)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isManager && review.status !== "in_review" && review.status !== "archived" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busyAction !== null}
            onClick={async () => {
              setBusyAction("start");
              try {
                await onStartReview();
              } finally {
                setBusyAction(null);
              }
            }}
          >
            {busyAction === "start" ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
            Start review
          </Button>
        )}
        <ApprovalActions canDecide={canDecide} currentDecision={currentDecision} onDecide={onDecide} onWithdraw={onWithdraw} />
        {isManager && review.status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busyAction !== null}
            onClick={async () => {
              setBusyAction("archive");
              try {
                await onArchiveReview();
              } finally {
                setBusyAction(null);
              }
            }}
          >
            {busyAction === "archive" ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
