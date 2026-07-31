/**
 * Review domain mutations — thin, typed wrappers over the RPC functions in
 * 20260731120100_review_functions.sql. Same pattern as
 * audio-upload/service.ts: plain functions taking a Supabase client first,
 * so identity/RLS is the caller's concern, and every function here is
 * directly testable with a real signed-in client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export interface PostCommentInput {
  threadId?: string;
  audioItemId: string;
  audioVersionId: string;
  isTimecoded: boolean;
  startMs?: number;
  endMs?: number;
  body: string;
  mentionedUserIds?: string[];
}

// The generated RPC arg types claim p_thread_id/p_start_ms/p_end_ms are
// non-nullable, but the SQL functions have no NOT NULL on these parameters
// (same situation as create_audio_version in audio-upload/service.ts) — a
// real null (no thread yet, a general non-timecoded comment) is more
// honest than a fabricated placeholder.
export async function postComment(supabase: Client, input: PostCommentInput): Promise<string> {
  const { data, error } = await supabase.rpc("post_comment", {
    p_thread_id: (input.threadId ?? null) as string,
    p_audio_item_id: input.audioItemId,
    p_audio_version_id: input.audioVersionId,
    p_is_timecoded: input.isTimecoded,
    p_start_ms: (input.startMs ?? null) as number,
    p_end_ms: (input.endMs ?? null) as number,
    p_body: input.body,
    p_mentioned_user_ids: input.mentionedUserIds ?? [],
  });
  if (error) throw error;
  return data;
}

export async function editComment(supabase: Client, commentId: string, newBody: string): Promise<void> {
  const { error } = await supabase.rpc("edit_comment", { p_comment_id: commentId, p_new_body: newBody });
  if (error) throw error;
}

export async function softDeleteComment(supabase: Client, commentId: string): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_comment", { p_comment_id: commentId });
  if (error) throw error;
}

export async function resolveThread(supabase: Client, threadId: string): Promise<string> {
  const { data, error } = await supabase.rpc("resolve_thread", { p_thread_id: threadId });
  if (error) throw error;
  return data;
}

export async function reopenThread(supabase: Client, threadId: string): Promise<string> {
  const { data, error } = await supabase.rpc("reopen_thread", { p_thread_id: threadId });
  if (error) throw error;
  return data;
}

export type ApprovalDecision = "approved" | "changes_requested";

export async function createApproval(
  supabase: Client,
  audioItemId: string,
  audioVersionId: string,
  decision: ApprovalDecision,
  note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_approval", {
    p_audio_item_id: audioItemId,
    p_audio_version_id: audioVersionId,
    p_decision: decision,
    p_note: (note ?? null) as string,
  });
  if (error) throw error;
  return data;
}

export async function withdrawApproval(
  supabase: Client,
  audioItemId: string,
  audioVersionId: string,
  note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("withdraw_approval", {
    p_audio_item_id: audioItemId,
    p_audio_version_id: audioVersionId,
    p_note: (note ?? null) as string,
  });
  if (error) throw error;
  return data;
}

export type ChangeRequestCategory = "wording" | "pronunciation" | "pacing" | "music_sound" | "technical_issue" | "general";
export type ChangeRequestPriority = "low" | "medium" | "high" | "urgent";

export interface CreateChangeRequestInput {
  audioItemId: string;
  audioVersionId: string;
  category: ChangeRequestCategory;
  message: string;
  timecodeMs?: number;
  priority: ChangeRequestPriority;
}

export async function createChangeRequest(supabase: Client, input: CreateChangeRequestInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_change_request", {
    p_audio_item_id: input.audioItemId,
    p_audio_version_id: input.audioVersionId,
    p_category: input.category,
    p_message: input.message,
    p_timecode_ms: (input.timecodeMs ?? null) as number,
    p_priority: input.priority,
  });
  if (error) throw error;
  return data;
}

export async function resolveChangeRequest(supabase: Client, changeRequestId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc("resolve_change_request", {
    p_change_request_id: changeRequestId,
    p_note: (note ?? null) as string,
  });
  if (error) throw error;
}

export async function cancelChangeRequest(supabase: Client, changeRequestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_change_request", { p_change_request_id: changeRequestId });
  if (error) throw error;
}

export async function startReview(supabase: Client, reviewId: string): Promise<void> {
  const { error } = await supabase.rpc("start_review", { p_review_id: reviewId });
  if (error) throw error;
}

export async function archiveReview(supabase: Client, reviewId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_review", { p_review_id: reviewId });
  if (error) throw error;
}
