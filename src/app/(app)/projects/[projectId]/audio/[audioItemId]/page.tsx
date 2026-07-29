import { notFound } from "next/navigation";
import { AudioReviewWorkspace } from "@/components/audio/audio-review-workspace";
import {
  getAudioItemById,
  getChangeRequestsForAudioVersion,
  getCommentsForAudioVersion,
  getScriptForAudioItem,
} from "@/lib/mock/queries";

export default async function AudioReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; audioItemId: string }>;
}) {
  const { projectId, audioItemId } = await params;
  const audioItem = getAudioItemById(audioItemId);
  const script = audioItem ? getScriptForAudioItem(audioItem.id) : undefined;
  if (!audioItem || !script || script.projectId !== projectId) notFound();

  const allComments = audioItem.versions.flatMap((v) => getCommentsForAudioVersion(v.id));
  const allChangeRequests = audioItem.versions.flatMap((v) => getChangeRequestsForAudioVersion(v.id));

  return (
    <AudioReviewWorkspace
      audioItem={audioItem}
      initialComments={allComments}
      initialChangeRequests={allChangeRequests}
    />
  );
}
