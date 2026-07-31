"use client";

import { useState } from "react";
import { Check, Clock, Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatTimecode } from "@/lib/format";
import type { CommentThread } from "@/lib/review/queries";

export function CommentThreadItem({
  thread,
  currentUserId,
  canModerate,
  isHighlighted,
  onHover,
  onSeek,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
}: {
  thread: CommentThread;
  currentUserId: string | null;
  /** IMA managers/reviewers can resolve/reopen anyone's thread; a comment's own author can always edit/delete it. */
  canModerate: boolean;
  isHighlighted: boolean;
  onHover: (threadId: string | null) => void;
  onSeek: (ms: number) => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onEdit: (commentId: string, newBody: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onResolve: (threadId: string) => Promise<void>;
  onReopen: (threadId: string) => Promise<void>;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function handleDelete(commentId: string) {
    setDeletingId(commentId);
    try {
      await onDelete(commentId);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResolveToggle() {
    setResolving(true);
    try {
      await (thread.isResolved ? onReopen(thread.id) : onResolve(thread.id));
    } finally {
      setResolving(false);
    }
  }

  const visibleComments = thread.comments;
  const rootComment = visibleComments[0];
  const replies = visibleComments.slice(1);

  async function submitReply() {
    if (replyBody.trim().length === 0) return;
    setReplying(true);
    try {
      await onReply(thread.id, replyBody.trim());
      setReplyBody("");
    } finally {
      setReplying(false);
    }
  }

  return (
    <div
      onMouseEnter={() => onHover(thread.id)}
      onMouseLeave={() => onHover(null)}
      className={`rounded-xl border p-3.5 transition-colors ${
        isHighlighted ? "border-brand/50 bg-brand-100/10" : "border-border bg-surface-raised"
      } ${thread.isResolved ? "opacity-70" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2">
        {thread.isTimecoded && thread.startMs != null && (
          <button
            type="button"
            onClick={() => onSeek(thread.startMs!)}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-ink-700 hover:bg-ink-100"
          >
            <Clock className="size-3" />
            {formatTimecode(thread.startMs)}
            {thread.endMs != null && `–${formatTimecode(thread.endMs)}`}
          </button>
        )}
        {thread.isResolved && (
          <Badge variant="outline" className="gap-1 border-emerald-300/50 text-[10px] text-emerald-700">
            <Check className="size-3" /> Resolved
          </Badge>
        )}
        <div className="ml-auto">
          {canModerate &&
            (thread.isResolved ? (
              <Button size="xs" variant="ghost" disabled={resolving} onClick={handleResolveToggle}>
                {resolving ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Reopen
              </Button>
            ) : (
              <Button size="xs" variant="ghost" disabled={resolving} onClick={handleResolveToggle}>
                {resolving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Resolve
              </Button>
            ))}
        </div>
      </div>

      <div className="space-y-3">
        {[rootComment, ...replies].map((comment) => {
          if (!comment) return null;
          const isOwn = comment.authorUserId === currentUserId;
          const isDeleted = !!comment.deletedAt;
          const isEditing = editingId === comment.id;
          const isDeleting = deletingId === comment.id;
          return (
            <div
              key={comment.id}
              className={`flex gap-2.5 transition-opacity duration-150 ${isDeleting ? "pointer-events-none opacity-50" : ""}`}
            >
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">
                  {comment.authorAvatarInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-medium text-ink-900">{comment.authorName}</span>
                  <span className="text-[11px] text-text-muted">{formatDateTime(comment.createdAt)}</span>
                  {comment.editedAt && !isDeleted && <span className="text-[11px] text-text-muted">(edited)</span>}
                </div>
                {isDeleted ? (
                  <p className="mt-0.5 text-sm text-text-muted italic">Comment removed</p>
                ) : isEditing ? (
                  <div className="mt-1 space-y-1.5">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="min-h-14 text-sm" />
                    <div className="flex gap-1.5">
                      <Button
                        size="xs"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onEdit(comment.id, editBody.trim());
                            setEditingId(null);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-800">{comment.body}</p>
                )}
              </div>
              {isOwn && !isDeleted && !isEditing && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="icon-xs" variant="ghost" aria-label="Comment actions">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditBody(comment.body);
                      }}
                    >
                      <Pencil className="size-3.5" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" disabled={isDeleting} onClick={() => handleDelete(comment.id)}>
                      {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-2.5">
        <Textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submitReply();
            }
          }}
          placeholder="Reply…"
          className="min-h-8 flex-1 py-1.5 text-sm"
        />
        <Button size="sm" disabled={replying || replyBody.trim().length === 0} onClick={submitReply}>
          {replying ? <Loader2 className="size-3.5 animate-spin" /> : "Reply"}
        </Button>
      </div>
    </div>
  );
}
