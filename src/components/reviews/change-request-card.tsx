"use client";

import { useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatTimecode } from "@/lib/format";
import type { ChangeRequestRecord } from "@/lib/review/queries";

const CATEGORY_LABEL: Record<string, string> = {
  wording: "Wording",
  pronunciation: "Pronunciation",
  pacing: "Pacing",
  music_sound: "Music / sound",
  technical_issue: "Technical issue",
  general: "General",
};

const PRIORITY_TONE: Record<string, string> = {
  low: "border-border text-text-muted",
  medium: "border-brand/30 text-brand",
  high: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  urgent: "border-red-300/60 text-red-700 dark:text-red-300",
};

export function ChangeRequestCard({
  changeRequest,
  canDecide,
  onSeek,
  onResolve,
  onCancel,
}: {
  changeRequest: ChangeRequestRecord;
  canDecide: boolean;
  onSeek: (ms: number) => void;
  onResolve: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"resolve" | "cancel" | null>(null);
  const isOpen = changeRequest.status === "open";

  async function run(action: "resolve" | "cancel") {
    setBusy(action);
    try {
      await (action === "resolve" ? onResolve(changeRequest.id) : onCancel(changeRequest.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`rounded-xl border p-3.5 ${isOpen ? "border-amber-300/40 bg-amber-50/30 dark:bg-amber-500/5" : "border-border bg-surface-raised opacity-70"}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {CATEGORY_LABEL[changeRequest.category] ?? changeRequest.category}
        </Badge>
        <Badge variant="outline" className={`text-[10px] ${PRIORITY_TONE[changeRequest.priority] ?? ""}`}>
          {changeRequest.priority}
        </Badge>
        {changeRequest.timecodeMs != null && (
          <button
            type="button"
            onClick={() => onSeek(changeRequest.timecodeMs!)}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-ink-700 hover:bg-ink-100"
          >
            <Clock className="size-3" />
            {formatTimecode(changeRequest.timecodeMs)}
          </button>
        )}
        <Badge
          variant="outline"
          className={`ml-auto text-[10px] ${
            changeRequest.status === "open"
              ? "border-amber-300/60 text-amber-700 dark:text-amber-300"
              : changeRequest.status === "resolved"
                ? "border-emerald-300/50 text-emerald-700 dark:text-emerald-300"
                : "text-text-muted"
          }`}
        >
          {changeRequest.status}
        </Badge>
      </div>

      <p className="text-sm whitespace-pre-wrap text-ink-800">{changeRequest.message}</p>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-text-muted">
          {changeRequest.createdByName} · {formatDateTime(changeRequest.createdAt)}
        </p>
        {isOpen && canDecide && (
          <div className="flex gap-1.5">
            <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => run("cancel")}>
              {busy === "cancel" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
              Cancel
            </Button>
            <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => run("resolve")}>
              {busy === "resolve" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Resolve
            </Button>
          </div>
        )}
        {!isOpen && changeRequest.resolvedByName && (
          <p className="text-[11px] text-text-muted">
            {changeRequest.status === "resolved" ? "Resolved" : "Cancelled"} by {changeRequest.resolvedByName}
          </p>
        )}
      </div>
    </div>
  );
}
