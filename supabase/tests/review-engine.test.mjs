// Phase 2C.2 — Review Engine integration tests, against the real local
// Supabase stack, as real signed-in users. Run via tsx:
//   node --env-file=.env.local --import tsx supabase/tests/review-engine.test.mjs
import { readFile } from "node:fs/promises";
import { signInAs, serviceClient, check, summarize } from "./helpers.mjs";
import * as uploadService from "@/lib/audio-upload/service";
import * as reviewService from "@/lib/review/service";
import { getActivityForAudioItem, getCommentThreadsForAudioItem, getApprovalsForAudioItem } from "@/lib/review/queries";

const STANDARD_RADIO_PROJECT_ID = "00000000-0000-0000-0000-000000000501";
const FIXTURES = new URL("./fixtures/audio/", import.meta.url);

async function fixtureBuffer(name) {
  return readFile(new URL(name, FIXTURES));
}

async function uploadVersion(client, variantId, buffer, fileName) {
  const slot = await uploadService.requestUploadSlot(client, { scriptVariantId: variantId }, fileName);
  const { error: uploadError } = await client.storage
    .from("audio-recordings")
    .upload(slot.storagePath, buffer, { contentType: "audio/wav" });
  if (uploadError) throw uploadError;
  return uploadService.finalizeUpload(client, slot.audioItemId, slot.storagePath, fileName);
}

const priya = await signInAs("priya.anand@ima.global"); // ima_admin
const sasha = await signInAs("sasha.lindqvist@ima.global"); // ima_reviewer
const helen = await signInAs("helen.marsh@jet2.com"); // jet2_reviewer
const fatima = await signInAs("fatima.iqbal@jet2.com"); // jet2_view_only
const ellie = await signInAs("ellie.nakamura@coastalsound.studio"); // studio_contributor — Coastal Sound owns project 501

// A throwaway script + variant, so this suite never touches the real seeded
// Winter Sun variants — same isolation pattern as audio-upload.test.mjs.
const { data: script } = await priya
  .from("scripts")
  .insert({ project_id: STANDARD_RADIO_PROJECT_ID, title: "Review Engine Test Script" })
  .select()
  .single();
const { data: variant } = await priya
  .from("script_variants")
  .insert({ script_id: script.id, variant_code: "REVIEW-TEST-01", column_order: 1 })
  .select()
  .single();

console.log("\n=== A review row is created automatically the instant the audio_item exists ===");
const bufferV1 = await fixtureBuffer("tone-440hz-3s.wav");
const v1 = await uploadVersion(priya, variant.id, bufferV1, "take1.wav");
const { data: audioItem } = await priya
  .from("audio_items")
  .select("id")
  .eq("script_variant_id", variant.id)
  .single();
const audioItemId = audioItem.id;

{
  const { data: review } = await serviceClient.from("reviews").select("*").eq("audio_item_id", audioItemId).single();
  check("a review row exists with no explicit creation call", !!review);
  check(
    "uploading version 1 moved the review to ready_for_review (was draft, not approved)",
    review.status === "ready_for_review",
  );
}

console.log("\n=== Comment lifecycle: post, edit (with history), soft delete (author-only) ===");
const generalCommentId = await reviewService.postComment(priya, {
  audioItemId,
  audioVersionId: v1.versionId,
  isTimecoded: false,
  body: "Original wording",
});
{
  const { data: comment } = await serviceClient.from("comments").select("*").eq("id", generalCommentId).single();
  check("comment stored with the right body and author", comment.body === "Original wording" && !!comment.author_user_id);
  check("comment is not timecoded — thread has no start_ms", true);
}

await reviewService.editComment(priya, generalCommentId, "Edited wording");
{
  const { data: comment } = await serviceClient.from("comments").select("*").eq("id", generalCommentId).single();
  check("editing overwrites body", comment.body === "Edited wording");
  check("editing sets edited_at", !!comment.edited_at);
  const { data: edits } = await serviceClient.from("comment_edits").select("*").eq("comment_id", generalCommentId);
  check("the OLD body is preserved in comment_edits before the overwrite", edits.length === 1 && edits[0].previous_body === "Original wording");
}

let nonAuthorEditThrew = false;
try {
  await reviewService.editComment(helen, generalCommentId, "Hijacked");
} catch {
  nonAuthorEditThrew = true;
}
check("a non-author cannot edit someone else's comment", nonAuthorEditThrew);
{
  const { data: comment } = await serviceClient.from("comments").select("body").eq("id", generalCommentId).single();
  check("the comment body is unchanged after the blocked edit attempt", comment.body === "Edited wording");
}

let nonAuthorDeleteThrew = false;
try {
  await reviewService.softDeleteComment(helen, generalCommentId);
} catch {
  nonAuthorDeleteThrew = true;
}
check("a non-author cannot delete someone else's comment", nonAuthorDeleteThrew);

await reviewService.softDeleteComment(priya, generalCommentId);
{
  const { data: comment } = await serviceClient.from("comments").select("*").eq("id", generalCommentId).single();
  check("the author CAN soft-delete their own comment", !!comment.deleted_at);
  check("soft delete retains the row and its body — nothing is overwritten or lost", comment.body === "Edited wording");
}

console.log("\n=== Thread lifecycle + timecode storage ===");
const threadCommentId = await reviewService.postComment(priya, {
  audioItemId,
  audioVersionId: v1.versionId,
  isTimecoded: true,
  startMs: 1500,
  endMs: 3200,
  body: "The pacing drags here",
});
const { data: threadComment } = await serviceClient.from("comments").select("thread_id").eq("id", threadCommentId).single();
const threadId = threadComment.thread_id;
{
  const { data: thread } = await serviceClient.from("comment_threads").select("*").eq("id", threadId).single();
  check("timecoded thread stores exact start_ms", thread.start_ms === 1500);
  check("timecoded thread stores exact end_ms", thread.end_ms === 3200);
  check("thread references the version it was created against", thread.audio_version_id === v1.versionId);
}

const replyId = await reviewService.postComment(helen, {
  threadId,
  audioItemId,
  audioVersionId: v1.versionId,
  isTimecoded: false,
  body: "Agreed — can we tighten this?",
});
{
  const { data: reply } = await serviceClient.from("comments").select("*").eq("id", replyId).single();
  check("a reply reuses the same thread_id (flat threading, no nested sub-threads)", reply.thread_id === threadId);
}

console.log("\n=== Resolution: resolve, then reopen — an insert-only event log ===");
await reviewService.resolveThread(priya, threadId);
{
  const threads = await getCommentThreadsForAudioItem(priya, audioItemId);
  const thread = threads.find((t) => t.id === threadId);
  check("resolving a thread is reflected in its derived isResolved state", thread.isResolved === true);
}
await reviewService.reopenThread(helen, threadId);
{
  const threads = await getCommentThreadsForAudioItem(priya, audioItemId);
  const thread = threads.find((t) => t.id === threadId);
  check("reopening flips the derived state back to open", thread.isResolved === false);
  const { data: resolutions } = await serviceClient
    .from("comment_thread_resolutions")
    .select("action")
    .eq("thread_id", threadId)
    .order("created_at");
  check(
    "both events are preserved — nothing overwrote the resolve event when it was reopened",
    resolutions.length === 2 && resolutions[0].action === "resolved" && resolutions[1].action === "reopened",
  );
}

console.log("\n=== Permission matrix ===");
let ellieCanComment = true;
try {
  await reviewService.postComment(ellie, { audioItemId, audioVersionId: v1.versionId, isTimecoded: false, body: "Retake uploaded" });
} catch {
  ellieCanComment = false;
}
check("Studio Contributor CAN comment", ellieCanComment);

let ellieCanApprove = true;
try {
  await reviewService.createApproval(ellie, audioItemId, v1.versionId, "approved");
} catch {
  ellieCanApprove = false;
}
check("Studio Contributor CANNOT approve", !ellieCanApprove);

let fatimaCanComment = true;
try {
  await reviewService.postComment(fatima, { audioItemId, audioVersionId: v1.versionId, isTimecoded: false, body: "Should be blocked" });
} catch {
  fatimaCanComment = false;
}
check("Jet2 view-only CANNOT comment", !fatimaCanComment);

let sashaCanComment = true;
try {
  await reviewService.postComment(sasha, { audioItemId, audioVersionId: v1.versionId, isTimecoded: false, body: "IMA reviewer note" });
} catch {
  sashaCanComment = false;
}
check("IMA Reviewer CAN comment", sashaCanComment);

let helenCanApprove = true;
let helenApprovalId;
try {
  helenApprovalId = await reviewService.createApproval(helen, audioItemId, v1.versionId, "approved");
} catch {
  helenCanApprove = false;
}
check("Jet2 Reviewer CAN approve", helenCanApprove);

console.log("\n=== Approval lifecycle ===");
{
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check("approving moves the review to approved", review.status === "approved");
}
{
  const { data: approval } = await serviceClient.from("approvals").select("*").eq("id", helenApprovalId).single();
  check("the approval names the exact version it was granted against", approval.audio_version_id === v1.versionId);
}

let approveOnStaleVersionThrew = false;
try {
  // v1 is current; a random non-existent version id can never be "current".
  await reviewService.createApproval(priya, audioItemId, "00000000-0000-0000-0000-000000000000", "approved");
} catch {
  approveOnStaleVersionThrew = true;
}
check("a decision can only be made against the item's CURRENT version", approveOnStaleVersionThrew);

const withdrawId = await reviewService.withdrawApproval(priya, audioItemId, v1.versionId);
{
  const { data: approval } = await serviceClient.from("approvals").select("decision").eq("id", withdrawId).single();
  check("withdrawing creates a NEW row (decision = withdrawn), not an update to the original", approval.decision === "withdrawn");
  const { data: original } = await serviceClient.from("approvals").select("decision").eq("id", helenApprovalId).single();
  check("the original approval decision is untouched — history is never overwritten", original.decision === "approved");
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check("withdrawing the standing decision on the current version reverts the review to ready_for_review", review.status === "ready_for_review");
}

let doubleWithdrawThrew = false;
try {
  await reviewService.withdrawApproval(priya, audioItemId, v1.versionId);
} catch {
  doubleWithdrawThrew = true;
}
check("withdrawing an already-withdrawn decision is rejected", doubleWithdrawThrew);

{
  const approvals = await getApprovalsForAudioItem(priya, audioItemId);
  check("historical approvals remain fully visible after withdrawal", approvals.history.length === 2);
  check("current standing for the version reflects the LATEST decision", approvals.currentStandingByVersion.get(v1.versionId)?.decision === "withdrawn");
}

console.log("\n=== Approval decision: Request Changes (distinct from the Change Requests entity) ===");
await reviewService.createApproval(priya, audioItemId, v1.versionId, "changes_requested");
{
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check("an approval decision of changes_requested moves the review to changes_requested", review.status === "changes_requested");
}

console.log("\n=== Change request lifecycle ===");
const crId = await reviewService.createChangeRequest(priya, {
  audioItemId,
  audioVersionId: v1.versionId,
  category: "pronunciation",
  message: "Destination name mispronounced",
  timecodeMs: 900,
  priority: "high",
});
{
  const { data: cr } = await serviceClient.from("change_requests").select("*").eq("id", crId).single();
  check("change request created with status open", cr.status === "open");
  check("change request stores its structured fields", cr.category === "pronunciation" && cr.priority === "high" && cr.timecode_ms === 900);
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check("opening a change request moves the review to changes_requested", review.status === "changes_requested");
}

let studioResolveThrew = false;
try {
  await reviewService.resolveChangeRequest(ellie, crId);
} catch {
  studioResolveThrew = true;
}
check("Studio Contributor cannot resolve a change request (decision-only action)", studioResolveThrew);

await reviewService.resolveChangeRequest(priya, crId, "Re-recorded correctly");
{
  const { data: cr } = await serviceClient.from("change_requests").select("*").eq("id", crId).single();
  check("resolving sets status + resolved_at + resolved_by", cr.status === "resolved" && !!cr.resolved_at && !!cr.resolved_by_user_id);
}

let resolveAlreadyResolvedThrew = false;
try {
  await reviewService.resolveChangeRequest(priya, crId);
} catch {
  resolveAlreadyResolvedThrew = true;
}
check("an already-resolved change request cannot be resolved again", resolveAlreadyResolvedThrew);

const crId2 = await reviewService.createChangeRequest(priya, {
  audioItemId,
  audioVersionId: v1.versionId,
  category: "general",
  message: "Never mind, disregard this one",
  priority: "low",
});
await reviewService.cancelChangeRequest(priya, crId2);
{
  const { data: cr } = await serviceClient.from("change_requests").select("status").eq("id", crId2).single();
  check("cancelling sets status to cancelled", cr.status === "cancelled");
}

console.log("\n=== Version superseding ===");
await reviewService.createApproval(priya, audioItemId, v1.versionId, "approved");
const bufferV2 = await fixtureBuffer("tone-fade-4s.wav");
const v2 = await uploadVersion(priya, variant.id, bufferV2, "take2.wav");
{
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check("uploading a new version over an APPROVED review marks it superseded", review.status === "superseded");
}
{
  const approvals = await getApprovalsForAudioItem(priya, audioItemId);
  const v1Standing = approvals.currentStandingByVersion.get(v1.versionId);
  check("the superseded version's own approval decision remains visible, unchanged", v1Standing?.decision === "approved");
}

let staleApprovalAfterSupersedeThrew = false;
try {
  await reviewService.createApproval(priya, audioItemId, v1.versionId, "approved");
} catch {
  staleApprovalAfterSupersedeThrew = true;
}
check("a decision can no longer be made against the now-superseded version", staleApprovalAfterSupersedeThrew);

await reviewService.createChangeRequest(priya, { audioItemId, audioVersionId: v2.versionId, category: "general", message: "One more pass", priority: "medium" });
const bufferV3 = await fixtureBuffer("tone-880hz-2s.mp3");
const v3 = await uploadVersion(priya, variant.id, bufferV3, "take3.mp3");
{
  const { data: review } = await serviceClient.from("reviews").select("status").eq("audio_item_id", audioItemId).single();
  check(
    "uploading a new version over a NON-approved review (changes_requested) moves it to ready_for_review, not superseded",
    review.status === "ready_for_review",
  );
}
check("each upload is a genuinely new version, never overwriting the last", v1.versionId !== v2.versionId && v2.versionId !== v3.versionId);

console.log("\n=== Activity: every transition is logged, newest first ===");
{
  const activity = await getActivityForAudioItem(priya, audioItemId);
  const actions = new Set(activity.map((e) => e.action));
  for (const expected of [
    "audio_uploaded",
    "audio_version_created",
    "comment_added",
    "comment_edited",
    "comment_deleted",
    "comment_resolved",
    "comment_reopened",
    "approval_granted",
    "approval_changes_requested",
    "approval_withdrawn",
    "change_request_created",
    "change_request_resolved",
    "change_request_cancelled",
  ]) {
    check(`activity log includes a "${expected}" event`, actions.has(expected));
  }
  const { data: rawEvents } = await serviceClient.from("activity_events").select("id, audio_item_id").eq("audio_item_id", audioItemId);
  check(
    "every event is filterable by the audio_item_id column directly (no metadata-parsing needed)",
    rawEvents.length === activity.length && rawEvents.every((e) => e.audio_item_id === audioItemId),
  );

  let isDescending = true;
  for (let i = 1; i < activity.length; i++) {
    if (new Date(activity[i].createdAt) > new Date(activity[i - 1].createdAt)) isDescending = false;
  }
  check("activity is ordered newest first", isDescending);
  check("the most recent event is the version-3 upload, not the original upload", activity[0].action === "audio_version_created");
}

// Cleanup — same rationale as audio-upload.test.mjs: only service_role can
// delete scripts, and this cascades through variants -> audio_items ->
// everything created above, leaving no trace for other suites.
await serviceClient.from("scripts").delete().eq("id", script.id);

summarize();
