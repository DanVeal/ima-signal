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
  ]);

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
        }}
      />
    </PageContainer>
  );
}
