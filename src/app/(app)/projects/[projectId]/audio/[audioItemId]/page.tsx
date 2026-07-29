import { notFound } from "next/navigation";
import { AudioReviewWorkspace } from "@/components/audio/audio-review-workspace";
import {
  getAudioItemById,
  getChangeRequestsForAudioVersion,
  getCommentsForAudioVersion,
  getProjectById,
  getScriptForAudioItem,
} from "@/lib/mock/queries";
import { getPramsSectionIdForScript, getPramsSectionName } from "@/lib/mock/prams-library";

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

  const project = getProjectById(projectId);
  let backHref: string | undefined;
  let backLabel: string | undefined;
  if (project?.type === "prams") {
    const sectionId = getPramsSectionIdForScript(script.id);
    if (sectionId) {
      backHref = `/projects/${projectId}/sections/${sectionId}`;
      backLabel = getPramsSectionName(sectionId);
    }
  }

  return (
    <AudioReviewWorkspace
      audioItem={audioItem}
      initialComments={allComments}
      initialChangeRequests={allChangeRequests}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
