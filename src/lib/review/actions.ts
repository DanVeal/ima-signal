"use server";

/**
 * Thin "use server" wrappers around service.ts — every call runs as the
 * signed-in user's own request-scoped Supabase client, never the service
 * role, so RLS is the real gate throughout. Mirrors audio-upload/actions.ts.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as service from "./service";
import type {
  PostCommentInput,
  ApprovalDecision,
  CreateChangeRequestInput,
} from "./service";

async function revalidateRecordingPage(audioItemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audio_items")
    .select(
      "script_variant:script_variants(script:scripts(project_id)), announcement_version:prams_announcement_versions(project_id)",
    )
    .eq("id", audioItemId)
    .maybeSingle();
  const projectId = data?.script_variant?.script?.project_id ?? data?.announcement_version?.project_id;
  if (projectId) revalidatePath(`/projects/${projectId}/recordings/${audioItemId}`);
}

export async function postComment(input: PostCommentInput) {
  const supabase = await createClient();
  const commentId = await service.postComment(supabase, input);
  await revalidateRecordingPage(input.audioItemId);
  return { commentId };
}

export async function editComment(commentId: string, newBody: string, audioItemId: string) {
  const supabase = await createClient();
  await service.editComment(supabase, commentId, newBody);
  await revalidateRecordingPage(audioItemId);
}

export async function softDeleteComment(commentId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.softDeleteComment(supabase, commentId);
  await revalidateRecordingPage(audioItemId);
}

export async function resolveThread(threadId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.resolveThread(supabase, threadId);
  await revalidateRecordingPage(audioItemId);
}

export async function reopenThread(threadId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.reopenThread(supabase, threadId);
  await revalidateRecordingPage(audioItemId);
}

export async function createApproval(
  audioItemId: string,
  audioVersionId: string,
  decision: ApprovalDecision,
  note?: string,
) {
  const supabase = await createClient();
  const approvalId = await service.createApproval(supabase, audioItemId, audioVersionId, decision, note);
  await revalidateRecordingPage(audioItemId);
  return { approvalId };
}

export async function withdrawApproval(audioItemId: string, audioVersionId: string, note?: string) {
  const supabase = await createClient();
  const approvalId = await service.withdrawApproval(supabase, audioItemId, audioVersionId, note);
  await revalidateRecordingPage(audioItemId);
  return { approvalId };
}

export async function createChangeRequest(input: CreateChangeRequestInput) {
  const supabase = await createClient();
  const changeRequestId = await service.createChangeRequest(supabase, input);
  await revalidateRecordingPage(input.audioItemId);
  return { changeRequestId };
}

export async function resolveChangeRequest(changeRequestId: string, audioItemId: string, note?: string) {
  const supabase = await createClient();
  await service.resolveChangeRequest(supabase, changeRequestId, note);
  await revalidateRecordingPage(audioItemId);
}

export async function cancelChangeRequest(changeRequestId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.cancelChangeRequest(supabase, changeRequestId);
  await revalidateRecordingPage(audioItemId);
}

export async function startReview(reviewId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.startReview(supabase, reviewId);
  await revalidateRecordingPage(audioItemId);
}

export async function archiveReview(reviewId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.archiveReview(supabase, reviewId);
  await revalidateRecordingPage(audioItemId);
}
