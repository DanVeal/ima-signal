import { notFound } from "next/navigation";
import { PageContainer } from "@/components/nav/page-container";
import { ReviewWorkspace } from "@/components/reviews/review-workspace";
import { createClient } from "@/lib/supabase/server";
import { getAudioItemDetail, getUploaderNames } from "@/lib/audio/queries";
import { getPlaybackUrl } from "@/lib/audio-upload/actions";
import {
  getActivityForAudioItem,
  getApprovalsForAudioItem,
  getChangeRequestsForAudioItem,
  getCommentThreadsForAudioItem,
  getMentionableUsersForProject,
  getReviewForAudioItem,
  getReviewParticipants,
  getReviewPermissions,
  getScriptLinesForAudioItem,
} from "@/lib/review/queries";
import {
  getAiJobsForAudioVersion,
  getAiPermissions,
  getComparisonForTranscriptVersion,
  getHealthSnapshotForAudioVersion,
  getPronunciationFindings,
  getTranscriptForAudioVersion,
} from "@/lib/intelligence/queries";

export const dynamic = "force-dynamic";

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; audioItemId: string }>;
}) {
  const { projectId, audioItemId } = await params;
  const supabase = await createClient();

  const detail = await getAudioItemDetail(supabase, audioItemId).catch(() => null);
  if (!detail || detail.projectId !== projectId) notFound();

  const currentVersion = detail.versions.find((v) => v.id === detail.currentVersionId) ?? null;

  const review = await getReviewForAudioItem(supabase, audioItemId);

  const [
    uploaders,
    playbackUrl,
    scriptData,
    participants,
    threads,
    changeRequests,
    approvals,
    activity,
    permissions,
    mentionable,
    transcript,
    health,
    aiJobs,
    aiPermissions,
  ] = await Promise.all([
    getUploaderNames(supabase, detail.versions.map((v) => v.uploadedByUserId)),
    currentVersion ? getPlaybackUrl(currentVersion.storagePath) : Promise.resolve(null),
    getScriptLinesForAudioItem(supabase, audioItemId),
    getReviewParticipants(supabase, review.id),
    getCommentThreadsForAudioItem(supabase, audioItemId),
    getChangeRequestsForAudioItem(supabase, audioItemId),
    getApprovalsForAudioItem(supabase, audioItemId),
    getActivityForAudioItem(supabase, audioItemId),
    getReviewPermissions(supabase, projectId),
    getMentionableUsersForProject(supabase, projectId),
    currentVersion ? getTranscriptForAudioVersion(supabase, currentVersion.id) : Promise.resolve(null),
    currentVersion ? getHealthSnapshotForAudioVersion(supabase, currentVersion.id) : Promise.resolve(null),
    currentVersion ? getAiJobsForAudioVersion(supabase, currentVersion.id) : Promise.resolve([]),
    getAiPermissions(supabase, projectId),
  ]);

  const [comparison, pronunciationFindings] = transcript?.currentVersion
    ? await Promise.all([
        getComparisonForTranscriptVersion(supabase, transcript.currentVersion.id),
        getPronunciationFindings(supabase, transcript.currentVersion.id),
      ])
    : [null, []];

  return (
    <PageContainer width="wide">
      <ReviewWorkspace
        data={{
          audioItemId,
          label: detail.label,
          detail,
          currentVersion,
          playbackUrl,
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
        }}
      />
    </PageContainer>
  );
}
