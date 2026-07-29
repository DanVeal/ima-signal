"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, FileAudio } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { AudioStatusBadge } from "@/components/status/audio-status-badge";
import { AudioPlayer } from "@/components/audio/audio-player";
import { VersionSelector } from "@/components/audio/version-selector";
import { ApprovalPanel } from "@/components/audio/approval-panel";
import { TranscriptPane, type WordSelection } from "@/components/transcript/transcript-pane";
import { ScriptPane } from "@/components/transcript/script-pane";
import { QcSummary } from "@/components/transcript/qc-summary";
import { DifferencesList } from "@/components/transcript/differences-list";
import { CommentThread } from "@/components/comments/comment-thread";
import { CommentComposer } from "@/components/comments/comment-composer";
import { ChangeRequestList } from "@/components/change-requests/change-request-list";
import { EmptyState } from "@/components/states/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AudioPlaybackProvider } from "@/lib/audio-playback-context";
import { useDemoUser } from "@/lib/demo-user-context";
import { createLocalId } from "@/lib/local-id";
import {
  getApprovedScriptVersion,
  getAudioVersionWithQc,
  getScriptForAudioItem,
  getProjectById,
  getScriptVersion,
} from "@/lib/mock/queries";
import type {
  ApprovalDecision,
  AudioItem,
  ChangeRequest,
  CommentCategory,
  ReviewComment,
} from "@/types/domain";

export function AudioReviewWorkspace({
  audioItem,
  initialComments,
  initialChangeRequests,
}: {
  audioItem: AudioItem;
  initialComments: ReviewComment[];
  initialChangeRequests: ChangeRequest[];
}) {
  const { currentUser } = useDemoUser();
  const script = getScriptForAudioItem(audioItem.id);
  const project = script ? getProjectById(script.projectId) : undefined;

  const sortedVersions = [...audioItem.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const [selectedVersionId, setSelectedVersionId] = useState(sortedVersions[0]?.id ?? "");
  const [comments, setComments] = useState(initialComments);
  const [changeRequests] = useState(initialChangeRequests);
  const [approvalOverrides, setApprovalOverrides] = useState<
    Record<string, { isApproved: boolean; status: string }>
  >({});
  const [selection, setSelection] = useState<WordSelection | null>(null);
  const [sidebarTab, setSidebarTab] = useState("differences");

  const baseVersion = audioItem.versions.find((v) => v.id === selectedVersionId);
  const versionWithQc = selectedVersionId ? getAudioVersionWithQc(selectedVersionId) : undefined;
  const override = approvalOverrides[selectedVersionId];
  const version = versionWithQc
    ? {
        ...versionWithQc,
        isApproved: override?.isApproved ?? versionWithQc.isApproved,
      }
    : undefined;

  const approvedScriptVersion = script ? getApprovedScriptVersion(script.id) : undefined;
  const versionScript = version ? getScriptVersion(script?.id ?? "", version.scriptVersionId) : undefined;

  const versionComments = comments.filter((c) => c.audioVersionId === selectedVersionId);
  const versionChangeRequests = changeRequests.filter((c) => c.audioVersionId === selectedVersionId);

  const canModerateComments =
    currentUser.role.startsWith("ima_") || currentUser.role === "jet2_reviewer";

  if (!script || !project || !baseVersion || !version) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileAudio}
          title="No audio uploaded yet"
          description="This variant is still waiting on a recording from the studio."
        />
      </PageContainer>
    );
  }

  function handleCreateComment(data: { category: CommentCategory; body: string }) {
    if (!selection || !version) return;
    const words = version.transcript ?? [];
    const startWord = words[selection.start];
    const endWord = words[selection.end];
    const newComment: ReviewComment = {
      id: createLocalId("comment"),
      projectId: project!.id,
      audioVersionId: selectedVersionId,
      scriptVersionId: version!.scriptVersionId,
      selectedText: words.slice(selection.start, selection.end + 1).map((w) => w.word).join(" "),
      startMs: startWord?.startMs,
      endMs: endWord?.endMs,
      authorUserId: currentUser.id,
      authorOrganisationId: currentUser.organisationId,
      category: data.category,
      body: data.body,
      status: "open",
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setComments((prev) => [newComment, ...prev]);
    setSelection(null);
    setSidebarTab("comments");
  }

  function handleGeneralComment(data: { category: CommentCategory; body: string }) {
    const newComment: ReviewComment = {
      id: createLocalId("comment"),
      projectId: project!.id,
      audioVersionId: selectedVersionId,
      scriptVersionId: version!.scriptVersionId,
      authorUserId: currentUser.id,
      authorOrganisationId: currentUser.organisationId,
      category: data.category,
      body: data.body,
      status: "open",
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setComments((prev) => [newComment, ...prev]);
  }

  function handleToggleStatus(commentId: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, status: c.status === "resolved" ? "reopened" : "resolved", editedAt: new Date().toISOString() }
          : c,
      ),
    );
  }

  function handleReply(commentId: string, body: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              replies: [
                ...c.replies,
                {
                  id: createLocalId("reply"),
                  authorUserId: currentUser.id,
                  body,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : c,
      ),
    );
  }

  function handleDecision(decision: ApprovalDecision) {
    if (decision === "approve" || decision === "approve_minor") {
      setApprovalOverrides((prev) => ({
        ...prev,
        [selectedVersionId]: { isApproved: true, status: "approved" },
      }));
    }
  }

  const selectedText =
    selection && version?.transcript
      ? version.transcript
          .slice(selection.start, selection.end + 1)
          .map((w) => w.word)
          .join(" ")
      : undefined;
  const selectionStartMs = selection && version?.transcript ? version.transcript[selection.start]?.startMs : undefined;
  const selectionEndMs = selection && version?.transcript ? version.transcript[selection.end]?.endMs : undefined;

  return (
    <AudioPlaybackProvider key={selectedVersionId} durationMs={version.durationSeconds * 1000}>
      <PageContainer width="wide">
        <Link
          href={`/projects/${project.id}`}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-ink-900"
        >
          <ChevronLeft className="size-3.5" />
          {project.name}
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                {script.title}
              </h1>
              <Badge variant="outline" className="font-mono text-[11px]">
                {script.variantCode}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              {script.departureAirport} → {script.destination}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AudioStatusBadge status={version.status} />
            <VersionSelector
              versions={audioItem.versions}
              selectedId={selectedVersionId}
              onChange={(id) => {
                setSelectedVersionId(id);
                setSelection(null);
              }}
            />
          </div>
        </div>

        <div className="mb-8">
          <AudioPlayer seed={version.id} />
        </div>

        <div
          key={selectedVersionId}
          className="grid animate-in fade-in grid-cols-1 gap-x-10 gap-y-8 duration-300 lg:grid-cols-[220px_minmax(0,1fr)_360px] xl:grid-cols-[260px_minmax(0,1fr)_380px]"
        >
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
              Approved script
              {approvedScriptVersion && (
                <span className="normal-case text-ink-400">V{approvedScriptVersion.versionNumber}</span>
              )}
            </h2>
            {versionScript ? (
              <ScriptPane body={versionScript.body} differences={version.qc?.differences ?? []} />
            ) : (
              <p className="text-sm text-text-muted">No approved script linked to this version.</p>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="mb-4 text-xs font-semibold tracking-wide text-text-muted uppercase">
                Transcript · V{version.versionNumber}
              </h2>
              {version.transcript && version.transcript.length > 0 ? (
                <TranscriptPane
                  words={version.transcript}
                  differences={version.qc?.differences ?? []}
                  comments={versionComments}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onOpenComment={() => setSidebarTab("comments")}
                />
              ) : (
                <EmptyState
                  icon={FileAudio}
                  title="Transcript processing"
                  description="Word-level transcript isn't available for this demo variant yet."
                  className="py-8"
                />
              )}
            </div>

            {selection && (
              <CommentComposer
                selectedText={selectedText}
                startMs={selectionStartMs}
                endMs={selectionEndMs}
                onSubmit={handleCreateComment}
                onCancel={() => setSelection(null)}
              />
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6">
            <QcSummary qc={version.qc} overallConfidence={version.overallConfidence} />

            <div className="border-t border-border-subtle pt-5">
              <Tabs value={sidebarTab} onValueChange={setSidebarTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="differences" className="flex-1">
                    Differences
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="flex-1">
                    Comments
                  </TabsTrigger>
                  <TabsTrigger value="changes" className="flex-1">
                    Changes
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="differences" className="mt-4 animate-in fade-in duration-200">
                  <DifferencesList differences={version.qc?.differences ?? []} />
                </TabsContent>
                <TabsContent value="comments" className="mt-4 animate-in fade-in space-y-4 duration-200">
                  <CommentComposer onSubmit={handleGeneralComment} />
                  <CommentThread
                    comments={versionComments}
                    canModerate={canModerateComments}
                    onToggleStatus={handleToggleStatus}
                    onReply={handleReply}
                  />
                </TabsContent>
                <TabsContent value="changes" className="mt-4 animate-in fade-in duration-200">
                  <ChangeRequestList changeRequests={versionChangeRequests} />
                </TabsContent>
              </Tabs>
            </div>

            <div className="border-t border-border-subtle pt-5">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
                Approval
              </h2>
              <ApprovalPanel audioVersion={version} currentUser={currentUser} onDecide={handleDecision} />
            </div>
          </aside>
        </div>
      </PageContainer>
    </AudioPlaybackProvider>
  );
}
