"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Section } from "@/components/nav/page-container";
import { AudioPlayer } from "@/components/audio/audio-player";
import type { WaveformCommentMarker, WaveformFindingMarker } from "@/components/audio/waveform";
import { AudioPlaybackProvider, RealAudioPlaybackProvider, useAudioPlayback } from "@/lib/audio-playback-context";
import { VersionHistory } from "@/components/recordings/version-history";
import { ReviewHeader } from "./review-header";
import { CommentComposer } from "./comment-composer";
import { ReviewFeed } from "./review-feed";
import { ReviewActivityTimeline } from "./review-activity-timeline";
import { ReviewSidebar } from "./review-sidebar";
import { TranscriptPanel } from "@/components/intelligence/transcript-panel";
import { AiJobStatus } from "@/components/intelligence/ai-job-status";
import type {
  ApprovalsForAudioItem,
  ChangeRequestRecord,
  CommentThread,
  MentionableUser,
  ReviewActivityEvent,
  ReviewParticipant,
  ReviewPermissions,
  ReviewSummary,
  ScriptPanelData,
} from "@/lib/review/queries";
import type { AudioItemDetail, RecordingVersionSummary } from "@/lib/audio/queries";
import type { ApprovalDecision, ChangeRequestCategory, ChangeRequestPriority } from "@/lib/review/service";
import type {
  AiJobSummary,
  AiPermissions,
  ComparisonDetail,
  ComparisonFindingRow,
  HealthSnapshotDetail,
  PronunciationFindingRow,
  TranscriptDetail,
} from "@/lib/intelligence/queries";
import * as reviewActions from "@/lib/review/actions";
import * as intelligenceActions from "@/lib/intelligence/actions";

export interface ReviewWorkspaceData {
  audioItemId: string;
  label: string;
  detail: AudioItemDetail;
  currentVersion: RecordingVersionSummary | null;
  playbackUrl: string | null;
  uploaders: Map<string, { fullName: string; avatarInitials: string }>;
  scriptData: ScriptPanelData;
  review: ReviewSummary;
  participants: ReviewParticipant[];
  threads: CommentThread[];
  changeRequests: ChangeRequestRecord[];
  approvals: ApprovalsForAudioItem;
  activity: ReviewActivityEvent[];
  permissions: ReviewPermissions;
  mentionable: MentionableUser[];
  transcript: TranscriptDetail | null;
  comparison: ComparisonDetail | null;
  pronunciationFindings: PronunciationFindingRow[];
  health: HealthSnapshotDetail | null;
  aiJobs: AiJobSummary[];
  aiPermissions: AiPermissions;
}

function WorkspaceBody({ data }: { data: ReviewWorkspaceData }) {
  const router = useRouter();
  const { seek, currentMs } = useAudioPlayback();
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [requestedTimecodeMs, setRequestedTimecodeMs] = useState<number | null>(null);
  const [highlightedFindingId, setHighlightedFindingId] = useState<string | null>(null);

  const {
    audioItemId,
    label,
    detail,
    currentVersion,
    uploaders,
    scriptData,
    review,
    participants,
    threads,
    changeRequests,
    approvals,
    activity,
    permissions,
    mentionable,
    transcript,
    comparison,
    pronunciationFindings,
    health,
    aiJobs,
    aiPermissions,
  } = data;

  // aiJobs is ordered newest-first, so this is the most recent transcription
  // job regardless of outcome — AiJobStatus treats a cancelled one the same
  // as "none yet" and offers Generate again.
  const transcriptionJob = aiJobs.find((j) => j.jobType === "transcription") ?? null;

  const uploaderName = currentVersion?.uploadedByUserId
    ? (uploaders.get(currentVersion.uploadedByUserId)?.fullName ?? null)
    : null;

  const versionNumberByAudioVersionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of detail.versions) map.set(v.id, v.versionNumber);
    return map;
  }, [detail.versions]);

  const currentDecision = currentVersion ? (approvals.currentStandingByVersion.get(currentVersion.id)?.decision ?? null) : null;

  const markers: WaveformCommentMarker[] = threads
    .filter((t) => t.isTimecoded && t.startMs != null && t.audioVersionId === currentVersion?.id)
    .map((t) => ({
      id: t.id,
      startMs: t.startMs!,
      endMs: t.endMs,
      isResolved: t.isResolved,
      isHighlighted: hoveredThreadId === t.id,
    }));

  function seekAndHighlight(threadId: string, ms: number) {
    seek(ms);
    setHoveredThreadId(threadId);
  }

  const findingMarkers: WaveformFindingMarker[] = (comparison?.findings ?? [])
    .filter((f) => f.startMs != null)
    .map((f) => ({
      id: f.id,
      startMs: f.startMs!,
      endMs: f.endMs,
      isHighlighted: highlightedFindingId === f.id,
      isIssue: f.classification !== "perfect",
    }));

  function handleSelectFinding(finding: ComparisonFindingRow) {
    setHighlightedFindingId(finding.id);
    if (finding.startMs != null) seek(finding.startMs);
  }

  async function handleGenerateTranscript() {
    if (!currentVersion) return;
    await intelligenceActions.requestTranscription(currentVersion.id, audioItemId);
    router.refresh();
  }

  async function handleRetryAiJob(jobId: string) {
    await intelligenceActions.retryAiJob(jobId, audioItemId);
    router.refresh();
  }

  async function handleCancelAiJob(jobId: string) {
    await intelligenceActions.cancelAiJob(jobId, audioItemId);
    router.refresh();
  }

  async function handlePostComment(input: {
    body: string;
    isTimecoded: boolean;
    timecodeMs: number | null;
    mentionedUserIds: string[];
  }) {
    if (!currentVersion) return;
    await reviewActions.postComment({
      audioItemId,
      audioVersionId: currentVersion.id,
      isTimecoded: input.isTimecoded,
      startMs: input.timecodeMs ?? undefined,
      body: input.body,
      mentionedUserIds: input.mentionedUserIds,
    });
    router.refresh();
  }

  async function handlePostChangeRequest(input: {
    message: string;
    category: ChangeRequestCategory;
    priority: ChangeRequestPriority;
    timecodeMs: number | null;
  }) {
    if (!currentVersion) return;
    await reviewActions.createChangeRequest({
      audioItemId,
      audioVersionId: currentVersion.id,
      category: input.category,
      message: input.message,
      priority: input.priority,
      timecodeMs: input.timecodeMs ?? undefined,
    });
    router.refresh();
  }

  async function handleReply(threadId: string, body: string) {
    if (!currentVersion) return;
    await reviewActions.postComment({ threadId, audioItemId, audioVersionId: currentVersion.id, isTimecoded: false, body });
    router.refresh();
  }

  async function handleEditComment(commentId: string, newBody: string) {
    await reviewActions.editComment(commentId, newBody, audioItemId);
    router.refresh();
  }

  async function handleDeleteComment(commentId: string) {
    await reviewActions.softDeleteComment(commentId, audioItemId);
    router.refresh();
  }

  async function handleResolveThread(threadId: string) {
    await reviewActions.resolveThread(threadId, audioItemId);
    router.refresh();
  }

  async function handleReopenThread(threadId: string) {
    await reviewActions.reopenThread(threadId, audioItemId);
    router.refresh();
  }

  async function handleResolveChangeRequest(id: string) {
    await reviewActions.resolveChangeRequest(id, audioItemId);
    router.refresh();
  }

  async function handleCancelChangeRequest(id: string) {
    await reviewActions.cancelChangeRequest(id, audioItemId);
    router.refresh();
  }

  async function handleDecide(decision: ApprovalDecision, note?: string) {
    if (!currentVersion) return;
    await reviewActions.createApproval(audioItemId, currentVersion.id, decision, note);
    router.refresh();
  }

  async function handleWithdraw(note?: string) {
    if (!currentVersion) return;
    await reviewActions.withdrawApproval(audioItemId, currentVersion.id, note);
    router.refresh();
  }

  async function handleStartReview() {
    await reviewActions.startReview(review.id, audioItemId);
    router.refresh();
  }

  async function handleArchiveReview() {
    await reviewActions.archiveReview(review.id, audioItemId);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-10">
        <ReviewHeader
          label={label}
          currentVersion={currentVersion}
          uploaderName={uploaderName}
          review={review}
          canDecide={permissions.canDecide}
          isManager={permissions.isManager}
          currentDecision={currentDecision}
          onDecide={handleDecide}
          onWithdraw={handleWithdraw}
          onStartReview={handleStartReview}
          onArchiveReview={handleArchiveReview}
        />

        {currentVersion ? (
          <Section title="Playback">
            <AudioPlayer
              seed={audioItemId}
              peaks={currentVersion.waveformPeaks}
              markers={markers}
              onMarkerClick={(id) => {
                const thread = threads.find((t) => t.id === id);
                if (thread?.startMs != null) seekAndHighlight(id, thread.startMs);
              }}
              onRequestComment={permissions.canComment ? (ms) => setRequestedTimecodeMs(ms) : undefined}
              findingMarkers={findingMarkers}
              onFindingMarkerClick={(id) => {
                const finding = comparison?.findings.find((f) => f.id === id);
                if (finding) handleSelectFinding(finding);
              }}
            />
          </Section>
        ) : (
          <Section title="Playback">
            <p className="text-sm text-text-muted">No recording uploaded yet.</p>
          </Section>
        )}

        <Section
          title="Script & transcript"
          description="The intended wording, what was actually said, and where they differ — Signal only flags; you decide."
        >
          <div id="ai-panel" className="mb-4">
            <AiJobStatus
              transcriptionJob={transcriptionJob}
              canGenerate={aiPermissions.canGenerate && !!currentVersion}
              onGenerate={handleGenerateTranscript}
              onRetry={handleRetryAiJob}
              onCancel={handleCancelAiJob}
            />
          </div>
          <TranscriptPanel
            scriptData={scriptData}
            transcript={transcript}
            comparison={comparison}
            pronunciationFindings={pronunciationFindings}
            highlightedFindingId={highlightedFindingId}
            onSelectFinding={handleSelectFinding}
          />
        </Section>

        <Section title="Comments" description="General notes, timecoded comments, and change requests — all in one feed.">
          {permissions.canComment && currentVersion && (
            <div className="mb-4">
              <CommentComposer
                audioItemId={audioItemId}
                currentMs={currentMs}
                mentionable={mentionable}
                canRequestChanges={permissions.canDecide}
                requestedTimecodeMs={requestedTimecodeMs}
                onClearRequestedTimecode={() => setRequestedTimecodeMs(null)}
                onSubmitComment={handlePostComment}
                onSubmitChangeRequest={handlePostChangeRequest}
              />
            </div>
          )}
          <ReviewFeed
            threads={threads}
            changeRequests={changeRequests}
            approvals={approvals.history}
            versionNumberByAudioVersionId={versionNumberByAudioVersionId}
            currentUserId={permissions.userId}
            canModerate={permissions.canComment}
            canDecideChangeRequests={permissions.canDecide}
            highlightedThreadId={hoveredThreadId}
            onHoverThread={setHoveredThreadId}
            onSeek={seek}
            onReply={handleReply}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
            onResolveThread={handleResolveThread}
            onReopenThread={handleReopenThread}
            onResolveChangeRequest={handleResolveChangeRequest}
            onCancelChangeRequest={handleCancelChangeRequest}
          />
        </Section>

        <Section title="Activity" description="Every event on this recording, newest first.">
          <ReviewActivityTimeline events={activity} />
        </Section>

        <Section
          title="Version history"
          description="Every uploaded version, oldest to newest — nothing is ever deleted. Restoring an older version creates a new one; it never rewrites history."
        >
          <VersionHistory
            versions={detail.versions}
            currentVersionId={detail.currentVersionId}
            uploaders={uploaders}
          />
        </Section>
      </div>

      <aside className="lg:pt-[4.5rem]">
        <ReviewSidebar
          review={review}
          participants={participants}
          latestActivity={activity}
          threads={threads}
          changeRequests={changeRequests}
          approvals={approvals}
          currentVersionId={currentVersion?.id ?? null}
          health={health}
        />
      </aside>
    </div>
  );
}

export function ReviewWorkspace({ data }: { data: ReviewWorkspaceData }) {
  if (!data.currentVersion || !data.playbackUrl) {
    // No audio yet — still show the header, script, comments, and activity
    // (general, non-timecoded comments are meaningful before a take
    // exists), just with an inert playback clock instead of a real one.
    return (
      <AudioPlaybackProvider durationMs={0}>
        <WorkspaceBody data={data} />
      </AudioPlaybackProvider>
    );
  }

  return (
    <RealAudioPlaybackProvider key={data.currentVersion.id} src={data.playbackUrl}>
      <WorkspaceBody data={data} />
    </RealAudioPlaybackProvider>
  );
}
