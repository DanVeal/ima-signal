"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTimecode } from "@/lib/format";
import type { MentionableUser } from "@/lib/review/queries";
import type { ChangeRequestCategory, ChangeRequestPriority } from "@/lib/review/service";

const CATEGORY_LABEL: Record<ChangeRequestCategory, string> = {
  wording: "Wording",
  pronunciation: "Pronunciation",
  pacing: "Pacing",
  music_sound: "Music / sound",
  technical_issue: "Technical issue",
  general: "General",
};

const PRIORITY_LABEL: Record<ChangeRequestPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export interface CommentDraft {
  body: string;
  isTimecoded: boolean;
  timecodeMs: number | null;
  mode: "comment" | "change_request";
  category: ChangeRequestCategory;
  priority: ChangeRequestPriority;
}

const EMPTY_DRAFT: CommentDraft = {
  body: "",
  isTimecoded: false,
  timecodeMs: null,
  mode: "comment",
  category: "general",
  priority: "medium",
};

function draftStorageKey(audioItemId: string) {
  return `ima-signal:review-draft:${audioItemId}`;
}

/**
 * The one composer for both a general/timecoded comment AND a structured
 * change request — see docs/review-engine.md for why these share one
 * surface. Autosaves to localStorage per audio item (UX spec: "Autosave
 * comment drafts") and warns on navigation away with unsaved text.
 */
export function CommentComposer({
  audioItemId,
  currentMs,
  mentionable,
  canRequestChanges,
  requestedTimecodeMs,
  onClearRequestedTimecode,
  onSubmitComment,
  onSubmitChangeRequest,
}: {
  audioItemId: string;
  currentMs: number;
  mentionable: MentionableUser[];
  canRequestChanges: boolean;
  /** Set when the waveform's "+" affordance was clicked at a specific time — pre-fills a timecoded draft. */
  requestedTimecodeMs: number | null;
  onClearRequestedTimecode: () => void;
  onSubmitComment: (input: {
    body: string;
    isTimecoded: boolean;
    timecodeMs: number | null;
    mentionedUserIds: string[];
  }) => Promise<void>;
  onSubmitChangeRequest: (input: {
    message: string;
    category: ChangeRequestCategory;
    priority: ChangeRequestPriority;
    timecodeMs: number | null;
  }) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CommentDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    // Deferred to an effect deliberately: reading localStorage during the
    // initial render would return different values on the server (none) vs.
    // the client (a saved draft), causing a hydration mismatch — same
    // precedent as demo-user-context.tsx.
    if (loadedRef.current) return;
    loadedRef.current = true;
    const saved = window.localStorage.getItem(draftStorageKey(audioItemId));
    if (saved) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDraft({ ...EMPTY_DRAFT, ...JSON.parse(saved) });
      } catch {
        // ignore a corrupt draft
      }
    }
  }, [audioItemId]);

  useEffect(() => {
    if (requestedTimecodeMs == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((prev) => ({ ...prev, isTimecoded: true, timecodeMs: Math.round(requestedTimecodeMs) }));
  }, [requestedTimecodeMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draft.body.trim().length === 0) {
      window.localStorage.removeItem(draftStorageKey(audioItemId));
      return;
    }
    window.localStorage.setItem(draftStorageKey(audioItemId), JSON.stringify(draft));
  }, [draft, audioItemId]);

  useEffect(() => {
    if (draft.body.trim().length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.body]);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    onClearRequestedTimecode();
    if (typeof window !== "undefined") window.localStorage.removeItem(draftStorageKey(audioItemId));
  }

  function extractMentions(body: string): string[] {
    const handles = Array.from(body.matchAll(/@([\w.-]+)/g)).map((m) => m[1].toLowerCase());
    return mentionable
      .filter((u) => handles.some((h) => u.fullName.toLowerCase().replace(/\s+/g, ".").startsWith(h)))
      .map((u) => u.id);
  }

  async function handleSubmit() {
    if (draft.body.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (draft.mode === "change_request") {
        await onSubmitChangeRequest({
          message: draft.body.trim(),
          category: draft.category,
          priority: draft.priority,
          timecodeMs: draft.isTimecoded ? draft.timecodeMs : null,
        });
      } else {
        await onSubmitComment({
          body: draft.body.trim(),
          isTimecoded: draft.isTimecoded,
          timecodeMs: draft.isTimecoded ? draft.timecodeMs : null,
          mentionedUserIds: extractMentions(draft.body),
        });
      }
      resetDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const lastWord = draft.body.split(/\s/).pop() ?? "";
  const showMentionList = lastWord.startsWith("@") && lastWord.length > 1;
  const mentionCandidates = showMentionList
    ? mentionable.filter((u) => u.fullName.toLowerCase().replace(/\s+/g, ".").includes(lastWord.slice(1).toLowerCase()))
    : [];

  function insertMention(user: MentionableUser) {
    const handle = user.fullName.toLowerCase().replace(/\s+/g, ".");
    setDraft((prev) => ({ ...prev, body: prev.body.replace(/@[\w.-]*$/, `@${handle} `) }));
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-surface-raised p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={draft.mode === "comment" ? "secondary" : "ghost"}
          onClick={() => setDraft((prev) => ({ ...prev, mode: "comment" }))}
        >
          Comment
        </Button>
        {canRequestChanges && (
          <Button
            type="button"
            size="sm"
            variant={draft.mode === "change_request" ? "secondary" : "ghost"}
            onClick={() => setDraft((prev) => ({ ...prev, mode: "change_request" }))}
          >
            Request change
          </Button>
        )}

        <span className="mx-1 h-4 w-px bg-border-subtle" />

        <Button
          type="button"
          size="sm"
          variant={draft.isTimecoded ? "secondary" : "ghost"}
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              isTimecoded: !prev.isTimecoded,
              timecodeMs: !prev.isTimecoded ? Math.round(currentMs) : prev.timecodeMs,
            }))
          }
        >
          <Clock className="size-3.5" />
          {draft.isTimecoded && draft.timecodeMs != null ? formatTimecode(draft.timecodeMs) : "At playhead"}
        </Button>
        {draft.isTimecoded && (
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove timecode" onClick={() => setDraft((prev) => ({ ...prev, isTimecoded: false, timecodeMs: null }))}>
            <X className="size-3.5" />
          </Button>
        )}

        {draft.mode === "change_request" && (
          <>
            <Select value={draft.category} onValueChange={(v) => setDraft((prev) => ({ ...prev, category: v as ChangeRequestCategory }))}>
              <SelectTrigger size="sm" className="h-7 w-auto min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={draft.priority} onValueChange={(v) => setDraft((prev) => ({ ...prev, priority: v as ChangeRequestPriority }))}>
              <SelectTrigger size="sm" className="h-7 w-auto min-w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className="relative">
        <Textarea
          value={draft.body}
          onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={
            draft.mode === "change_request"
              ? "Describe the change that's needed…"
              : "Add a comment — type @ to mention someone…"
          }
          className="min-h-20"
        />
        {showMentionList && mentionCandidates.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-md">
            {mentionCandidates.slice(0, 6).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => insertMention(u)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                  {u.avatarInitials}
                </Badge>
                {u.fullName}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-critical">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-muted">⌘/Ctrl + Enter to send · draft autosaves</p>
        <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting || draft.body.trim().length === 0}>
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {draft.mode === "change_request" ? "Request change" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
