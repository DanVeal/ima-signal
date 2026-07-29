"use client";

import { useState } from "react";
import { CircleDot, CheckCircle2, RotateCcw, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/states/empty-state";
import { CATEGORY_LABEL } from "@/lib/comment-categories";
import { formatDateTime, formatTimecode } from "@/lib/format";
import { getOrganisation, getUser } from "@/lib/mock/queries";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import type { ReviewComment } from "@/types/domain";

const STATUS_CONFIG = {
  open: { icon: CircleDot, label: "Open", tone: "text-signal-600" },
  resolved: { icon: CheckCircle2, label: "Resolved", tone: "text-success" },
  reopened: { icon: RotateCcw, label: "Reopened", tone: "text-important" },
};

export function CommentThread({
  comments,
  canModerate,
  onToggleStatus,
  onReply,
}: {
  comments: ReviewComment[];
  canModerate: boolean;
  onToggleStatus: (commentId: string) => void;
  onReply: (commentId: string, body: string) => void;
}) {
  const { seek } = useAudioPlayback();

  if (comments.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No comments on this version"
        description="Select transcript wording or leave a general comment to start the conversation."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-4">
      {comments.map((comment) => {
        const author = getUser(comment.authorUserId);
        const org = getOrganisation(comment.authorOrganisationId);
        const status = STATUS_CONFIG[comment.status];
        const StatusIcon = status.icon;

        return (
          <li key={comment.id} className="rounded-md border border-border-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-ink-100 text-[11px] font-medium text-ink-700">
                    {author?.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-medium text-ink-900">{author?.fullName}</p>
                  <p className="text-[11px] text-text-muted">
                    {org?.name} · {formatDateTime(comment.createdAt)}
                  </p>
                </div>
              </div>
              <span className={`flex items-center gap-1 text-[11px] font-medium ${status.tone}`}>
                <StatusIcon className="size-3" />
                {status.label}
              </span>
            </div>

            {comment.selectedText && (
              <button
                onClick={() => comment.startMs !== undefined && seek(comment.startMs)}
                className="mt-2 block w-full rounded-md bg-comment-100 px-2.5 py-1.5 text-left text-xs text-ink-800 hover:bg-comment-100/70"
              >
                <span className="font-mono text-comment">
                  {comment.startMs !== undefined ? formatTimecode(comment.startMs) : ""}
                </span>{" "}
                &ldquo;{comment.selectedText}&rdquo;
              </button>
            )}

            <p className="mt-2 text-sm text-ink-800">{comment.body}</p>
            <span className="mt-1.5 inline-block rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-text-secondary">
              {CATEGORY_LABEL[comment.category]}
            </span>

            {comment.replies.length > 0 && (
              <ul className="mt-2 space-y-2 border-l-2 border-border-subtle pl-3">
                {comment.replies.map((reply) => {
                  const replyAuthor = getUser(reply.authorUserId);
                  return (
                    <li key={reply.id} className="text-xs">
                      <span className="font-medium text-ink-900">{replyAuthor?.fullName}</span>{" "}
                      <span className="text-text-muted">{formatDateTime(reply.createdAt)}</span>
                      <p className="mt-0.5 text-ink-800">{reply.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <ReplyBox onSubmit={(body) => onReply(comment.id, body)} />
              {canModerate && (
                <Button variant="ghost" size="xs" onClick={() => onToggleStatus(comment.id)}>
                  {comment.status === "resolved" ? "Reopen" : "Resolve"}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReplyBox({ onSubmit }: { onSubmit: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        Reply
      </Button>
    );
  }

  return (
    <form
      className="flex w-full items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
        setOpen(false);
      }}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
        className="min-h-8 text-xs"
        placeholder="Write a reply…"
        autoFocus
      />
      <Button type="submit" size="xs" disabled={!value.trim()}>
        Send
      </Button>
    </form>
  );
}
