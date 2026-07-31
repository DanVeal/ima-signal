"use client";

import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { CommentThreadItem } from "./comment-thread-item";
import { ChangeRequestCard } from "./change-request-card";
import { ApprovalCard } from "./approval-card";
import type { CommentThread, ApprovalRecord, ChangeRequestRecord } from "@/lib/review/queries";

type FeedFilter = "all" | "open" | "resolved" | "mine" | "timecoded" | "general" | "change_requests" | "approvals";

const FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "mine", label: "My comments" },
  { value: "timecoded", label: "Timecoded" },
  { value: "general", label: "General" },
  { value: "change_requests", label: "Change requests" },
  { value: "approvals", label: "Approvals" },
];

interface FeedItem {
  key: string;
  activityAt: string;
  render: () => React.ReactNode;
  matches: (filter: FeedFilter, currentUserId: string | null) => boolean;
}

export function ReviewFeed({
  threads,
  changeRequests,
  approvals,
  versionNumberByAudioVersionId,
  currentUserId,
  canModerate,
  canDecideChangeRequests,
  highlightedThreadId,
  onHoverThread,
  onSeek,
  onReply,
  onEditComment,
  onDeleteComment,
  onResolveThread,
  onReopenThread,
  onResolveChangeRequest,
  onCancelChangeRequest,
}: {
  threads: CommentThread[];
  changeRequests: ChangeRequestRecord[];
  approvals: ApprovalRecord[];
  versionNumberByAudioVersionId: Map<string, number>;
  currentUserId: string | null;
  canModerate: boolean;
  canDecideChangeRequests: boolean;
  highlightedThreadId: string | null;
  onHoverThread: (id: string | null) => void;
  onSeek: (ms: number) => void;
  onReply: (threadId: string, body: string) => Promise<void>;
  onEditComment: (commentId: string, newBody: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onResolveThread: (threadId: string) => Promise<void>;
  onReopenThread: (threadId: string) => Promise<void>;
  onResolveChangeRequest: (id: string) => Promise<void>;
  onCancelChangeRequest: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<FeedFilter>("all");

  const items = useMemo<FeedItem[]>(() => {
    const threadItems: FeedItem[] = threads.map((thread) => {
      const latest = thread.comments.at(-1)?.createdAt ?? thread.createdAt;
      return {
        key: `thread:${thread.id}`,
        activityAt: latest,
        render: () => (
          <CommentThreadItem
            key={thread.id}
            thread={thread}
            currentUserId={currentUserId}
            canModerate={canModerate}
            isHighlighted={highlightedThreadId === thread.id}
            onHover={onHoverThread}
            onSeek={onSeek}
            onReply={onReply}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            onResolve={onResolveThread}
            onReopen={onReopenThread}
          />
        ),
        matches: (f, uid) => {
          if (f === "resolved") return thread.isResolved;
          if (f === "open") return !thread.isResolved;
          if (f === "mine") return thread.comments.some((c) => c.authorUserId === uid);
          if (f === "timecoded") return thread.isTimecoded;
          if (f === "general") return !thread.isTimecoded;
          if (f === "change_requests" || f === "approvals") return false;
          return true;
        },
      };
    });

    const changeRequestItems: FeedItem[] = changeRequests.map((cr) => ({
      key: `cr:${cr.id}`,
      activityAt: cr.resolvedAt ?? cr.createdAt,
      render: () => (
        <ChangeRequestCard
          key={cr.id}
          changeRequest={cr}
          canDecide={canDecideChangeRequests}
          onSeek={onSeek}
          onResolve={onResolveChangeRequest}
          onCancel={onCancelChangeRequest}
        />
      ),
      matches: (f, uid) => {
        if (f === "resolved") return cr.status === "resolved";
        if (f === "open") return cr.status === "open";
        if (f === "mine") return cr.createdByUserId === uid;
        if (f === "timecoded") return cr.timecodeMs != null;
        if (f === "general") return cr.timecodeMs == null;
        if (f === "change_requests") return true;
        if (f === "approvals") return false;
        return true;
      },
    }));

    const approvalItems: FeedItem[] = approvals.map((approval) => ({
      key: `approval:${approval.id}`,
      activityAt: approval.createdAt,
      render: () => (
        <ApprovalCard key={approval.id} approval={approval} versionNumber={versionNumberByAudioVersionId.get(approval.audioVersionId)} />
      ),
      matches: (f, uid) => {
        if (f === "resolved" || f === "open" || f === "timecoded" || f === "general" || f === "change_requests") return false;
        if (f === "mine") return approval.decidedByUserId === uid;
        return true;
      },
    }));

    return [...threadItems, ...changeRequestItems, ...approvalItems].sort(
      (a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
    );
  }, [
    threads,
    changeRequests,
    approvals,
    versionNumberByAudioVersionId,
    currentUserId,
    canModerate,
    canDecideChangeRequests,
    highlightedThreadId,
    onHoverThread,
    onSeek,
    onReply,
    onEditComment,
    onDeleteComment,
    onResolveThread,
    onReopenThread,
    onResolveChangeRequest,
    onCancelChangeRequest,
  ]);

  const visible = items.filter((item) => filter === "all" || item.matches(filter, currentUserId));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="xs"
            variant={filter === f.value ? "secondary" : "ghost"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nothing here yet"
          description="Comments, change requests, and approval decisions will show up here as the review progresses."
        />
      ) : (
        <div className="space-y-3">{visible.map((item) => item.render())}</div>
      )}
    </div>
  );
}
