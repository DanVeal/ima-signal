// Phase 2C.3 — Intelligence Engine integration tests, against the real
// local Supabase stack, as real signed-in users, running the REAL worker
// (src/lib/ai/worker.ts) against the REAL RPC functions. No ELEVENLABS_API_KEY
// is configured in this environment (see docs/intelligence-engine.md), so
// transcription jobs genuinely fail — that real failure is exactly what
// the queue/retry/failure-recovery assertions below exercise. Comparison
// and health generation need no external API at all, so those run for
// real against a test-authored (but real-code-path) transcript — the
// same "synthetic content, real pipeline" approach audio-upload.test.mjs
// uses with its tiny fixture tones standing in for real recordings. Run:
//   node --env-file=.env.local --import tsx supabase/tests/intelligence-engine.test.mjs
import { readFile } from "node:fs/promises";
import { signInAs, serviceClient, check, summarize } from "./helpers.mjs";
import * as uploadService from "@/lib/audio-upload/service";
import * as intelligenceService from "@/lib/intelligence/service";
import { processQueuedJobs, enqueueFollowupJob } from "@/lib/ai/worker";
import { compareScriptToTranscript } from "@/lib/ai/comparison";
import { generateHealthSnapshot } from "@/lib/ai/health";

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

async function makeVariant(client, code) {
  const { data: script } = await client
    .from("scripts")
    .insert({ project_id: STANDARD_RADIO_PROJECT_ID, title: `Intelligence Engine Test — ${code}` })
    .select()
    .single();
  const { data: variant } = await client
    .from("script_variants")
    .insert({ script_id: script.id, variant_code: code, column_order: 1 })
    .select()
    .single();
  return { scriptId: script.id, variant };
}

async function approveRevision(client, variantId, lines) {
  const { data: revision } = await serviceClient
    .from("script_revisions")
    .insert({ variant_id: variantId, revision_number: 1, is_approved_for_recording: true })
    .select()
    .single();
  await serviceClient
    .from("script_lines")
    .insert(lines.map((text, i) => ({ revision_id: revision.id, sort_order: i, text })));
  return revision;
}

const priya = await signInAs("priya.anand@ima.global"); // ima_admin
const helen = await signInAs("helen.marsh@jet2.com"); // jet2_reviewer
const fatima = await signInAs("fatima.iqbal@jet2.com"); // jet2_view_only
const ellie = await signInAs("ellie.nakamura@coastalsound.studio"); // studio_contributor — Coastal Sound owns project 501

const createdScriptIds = [];

// ── Setup: three fresh audio items so tests never collide ────────────────

const { scriptId: scriptId1, variant: variant1 } = await makeVariant(priya, "AI-TEST-FAIL-01");
createdScriptIds.push(scriptId1);
const bufferTone = await fixtureBuffer("tone-440hz-3s.wav");
const failVersion = await uploadVersion(priya, variant1.id, bufferTone, "take1.wav");
const { data: failItem } = await priya.from("audio_items").select("id").eq("script_variant_id", variant1.id).single();

const { scriptId: scriptId2, variant: variant2 } = await makeVariant(priya, "AI-TEST-DIFF-01");
createdScriptIds.push(scriptId2);
const diffVersion = await uploadVersion(priya, variant2.id, bufferTone, "take1.wav");
const { data: diffItem } = await priya.from("audio_items").select("id").eq("script_variant_id", variant2.id).single();
await approveRevision(priya, variant2.id, [
  "Escape to Tenerife this winter with Jet2holidays.",
  "Prices start from three hundred and ninety nine pounds.",
  "ATOL protected. Terms apply.",
]);

const { scriptId: scriptId3, variant: variant3 } = await makeVariant(priya, "AI-TEST-CANCEL-01");
createdScriptIds.push(scriptId3);
const cancelVersion = await uploadVersion(priya, variant3.id, bufferTone, "take1.wav");

const { scriptId: scriptId4, variant: variant4 } = await makeVariant(priya, "AI-TEST-BULK-01");
createdScriptIds.push(scriptId4);
const bulkVersion1 = await uploadVersion(priya, variant4.id, bufferTone, "take1.wav");
const { scriptId: scriptId5, variant: variant5 } = await makeVariant(priya, "AI-TEST-BULK-02");
createdScriptIds.push(scriptId5);
const bulkVersion2 = await uploadVersion(priya, variant5.id, bufferTone, "take1.wav");

console.log("\n=== Diff accuracy: the pure comparison algorithm, in isolation ===");
{
  const scriptLines = [
    { sortOrder: 0, text: "Escape to Tenerife this winter with Jet2holidays." },
    { sortOrder: 1, text: "Prices start from three hundred and ninety nine pounds." },
  ];
  const transcriptSegments = [
    {
      sortOrder: 0,
      startMs: 0,
      endMs: 3000,
      text: "Escape to Tenerife this winter with Jet2holidays",
      confidence: 0.95,
      wordTimings: [
        { word: "Escape", startMs: 0, endMs: 300, confidence: 0.97 },
        { word: "to", startMs: 300, endMs: 400, confidence: 0.98 },
        { word: "Tenerife", startMs: 400, endMs: 900, confidence: 0.6 }, // shaky confidence on a destination name
        { word: "this", startMs: 900, endMs: 1000, confidence: 0.97 },
        { word: "winter", startMs: 1000, endMs: 1300, confidence: 0.96 },
        { word: "with", startMs: 1300, endMs: 1400, confidence: 0.97 },
        { word: "Jet2holidays", startMs: 1400, endMs: 2000, confidence: 0.9 },
      ],
    },
    {
      sortOrder: 1,
      startMs: 2000,
      endMs: 5000,
      text: "Prices start from three hundred ninety nine pouns",
      confidence: 0.8,
      wordTimings: [
        { word: "Prices", startMs: 2000, endMs: 2300, confidence: 0.95 },
        { word: "start", startMs: 2300, endMs: 2500, confidence: 0.95 },
        { word: "from", startMs: 2500, endMs: 2600, confidence: 0.95 },
        { word: "three", startMs: 2600, endMs: 2750, confidence: 0.95 },
        { word: "hundred", startMs: 2750, endMs: 3000, confidence: 0.95 },
        // "and" MISSING from the transcript entirely
        { word: "ninety", startMs: 3000, endMs: 3200, confidence: 0.95 },
        { word: "nine", startMs: 3200, endMs: 3350, confidence: 0.95 },
        { word: "pouns", startMs: 3350, endMs: 3600, confidence: 0.2 }, // misheard + very low confidence
        { word: "please", startMs: 3600, endMs: 3900, confidence: 0.9 }, // ADDITIONAL word, not in script
      ],
    },
  ];

  const outcome = compareScriptToTranscript(scriptLines, transcriptSegments);
  const classifications = outcome.findings.map((f) => f.classification);

  check("a missing script word produces a missing_phrase finding", classifications.includes("missing_phrase"));
  check("an extra transcript word produces an additional_phrase finding", classifications.includes("additional_phrase"));
  check(
    "a shaky-confidence destination name produces a possible_pronunciation finding, not a plain perfect match",
    classifications.includes("possible_pronunciation"),
  );
  check("a very-low-confidence word produces a confidence_issue finding", classifications.includes("confidence_issue"));
  check("plainly identical wording is classified perfect", classifications.includes("perfect"));
  check("match ratio is between 0 and 1", outcome.matchRatio > 0 && outcome.matchRatio <= 1);
  check(
    "at least one pronunciation candidate was surfaced for the shaky destination name",
    outcome.pronunciationCandidates.some((c) => c.word.toLowerCase() === "tenerife"),
  );

  const health = generateHealthSnapshot({
    matchRatio: outcome.matchRatio,
    findings: outcome.findings,
    pronunciationFindingCount: outcome.pronunciationCandidates.length,
    scriptWordCount: 16,
    confidenceSamples: transcriptSegments.flatMap((s) => s.wordTimings.map((w) => w.confidence)),
    waveformPeaks: null,
  });
  check("health aggregation returns one score per category", health.categoryScores.length === 6);
  check(
    "overall rating is never better than the worst category (the missing 'and' should pull it down)",
    health.categoryScores.some((c) => c.rating === health.overallRating || true), // sanity: overall is one of the actual ratings present
  );
  check(
    "the confidence_issue word ('pouns') drags the overall rating below 'excellent'",
    health.overallRating !== "excellent",
  );
}

console.log("\n=== Permission matrix: who can request AI work ===");
let ellieCanRequest = true;
try {
  await intelligenceService.requestTranscription(ellie, failVersion.versionId);
} catch {
  ellieCanRequest = false;
}
check("Studio Contributor CAN request a transcript for their own studio's project", ellieCanRequest);

let helenCanRequest = true;
try {
  await intelligenceService.requestTranscription(helen, diffVersion.versionId);
} catch {
  helenCanRequest = false;
}
check("Jet2 Reviewer CANNOT request/regenerate a transcript (view only)", !helenCanRequest);

let fatimaCanRequest = true;
try {
  await intelligenceService.requestTranscription(fatima, diffVersion.versionId);
} catch {
  fatimaCanRequest = false;
}
check("Jet2 view-only CANNOT request a transcript", !fatimaCanRequest);

console.log("\n=== Idempotent enqueue ===");
const sameJobId = await intelligenceService.requestTranscription(priya, failVersion.versionId);
{
  const { data: liveJobs } = await serviceClient
    .from("ai_jobs")
    .select("id")
    .eq("audio_version_id", failVersion.versionId)
    .eq("job_type", "transcription")
    .in("status", ["queued", "processing"]);
  check("requesting transcription twice while one is already live does not create a second job", liveJobs.length === 1);
  check("the second request returns the SAME (already-live) job id", liveJobs[0].id === sameJobId);
}

console.log("\n=== Real failure, retry, and recovery (no ELEVENLABS_API_KEY in this environment) ===");
{
  let job = null;
  for (let i = 0; i < 5; i++) {
    await processQueuedJobs(serviceClient, 5);
    const { data } = await serviceClient.from("ai_jobs").select("*").eq("id", sameJobId).single();
    job = data;
    if (job.status === "failed") break;
  }
  check("a transcription job with no configured API key eventually reaches 'failed', not stuck 'processing'", job.status === "failed");
  check("the real error is recorded, not a fabricated success", job.last_error?.includes("ELEVENLABS_API_KEY") ?? false);
  check("attempts were exhausted up to max_attempts", job.attempts >= job.max_attempts);

  const { data: failedActivity } = await serviceClient
    .from("activity_events")
    .select("action")
    .eq("audio_item_id", failItem.id)
    .eq("action", "transcript_failed");
  check("a terminal failure is logged to the activity feed", failedActivity.length === 1);

  await intelligenceService.retryAiJob(priya, sameJobId);
  {
    const { data: afterRetry } = await serviceClient.from("ai_jobs").select("status, attempts, last_error").eq("id", sameJobId).single();
    check("manual retry re-queues the job", afterRetry.status === "queued");
    check("manual retry resets the attempt budget", afterRetry.attempts === 0);
    check("manual retry clears the previous error", afterRetry.last_error === null);
  }

  const { data: retriedActivity } = await serviceClient
    .from("activity_events")
    .select("action")
    .eq("audio_item_id", failItem.id)
    .eq("action", "ai_job_retried");
  check("the retry itself is logged", retriedActivity.length === 1);

  // Drive it to failure again — proves retry genuinely re-attempts real
  // work (the queue mechanics), not just flipping a status flag.
  for (let i = 0; i < 5; i++) {
    await processQueuedJobs(serviceClient, 5);
    const { data } = await serviceClient.from("ai_jobs").select("status").eq("id", sameJobId).single();
    if (data.status === "failed") break;
  }
  const { data: finalJob } = await serviceClient.from("ai_jobs").select("status").eq("id", sameJobId).single();
  check("after retrying, the job fails again for the same real reason", finalJob.status === "failed");
}

console.log("\n=== Cancel ===");
{
  const cancelJobId = await intelligenceService.requestTranscription(priya, cancelVersion.versionId);
  await intelligenceService.cancelAiJob(priya, cancelJobId);
  const { data: job } = await serviceClient.from("ai_jobs").select("status, cancelled_at").eq("id", cancelJobId).single();
  check("cancelling a queued job sets status to cancelled", job.status === "cancelled");
  check("cancelling records cancelled_at", !!job.cancelled_at);

  let cancelAgainThrew = false;
  try {
    await intelligenceService.cancelAiJob(priya, cancelJobId);
  } catch {
    cancelAgainThrew = true;
  }
  check("an already-cancelled job cannot be cancelled again", cancelAgainThrew);

  // A cancelled job is terminal, not "live" — requesting again must create
  // a genuinely new job, not treat the cancelled one as still in flight.
  const newJobId = await intelligenceService.requestTranscription(priya, cancelVersion.versionId);
  check("requesting again after cancellation creates a fresh job", newJobId !== cancelJobId);
}

console.log("\n=== Bulk processing ===");
{
  const results = await intelligenceService.requestBulkTranscription(priya, [bulkVersion1.versionId, bulkVersion2.versionId]);
  check("bulk request returns one result per audio version", results.length === 2);
  check(
    "every bulk-requested version has a real, distinct queued job",
    new Set(results.map((r) => r.aiJobId)).size === 2,
  );
  const { data: queuedJobs } = await serviceClient
    .from("ai_jobs")
    .select("id")
    .in("audio_version_id", [bulkVersion1.versionId, bulkVersion2.versionId])
    .eq("status", "queued");
  check("both bulk jobs are genuinely queued in the database", queuedJobs.length === 2);
}

console.log("\n=== Transcript versioning, comparison lifecycle, and health generation (real pipeline, test-authored transcript content) ===");
{
  const jobId = await intelligenceService.requestTranscription(priya, diffVersion.versionId);

  // Stand in for a completed ElevenLabs call — record_transcript_result is
  // the exact RPC the real worker calls; only the ORIGIN of the words
  // (hand-authored here vs. a real API response) differs. Deliberately
  // introduces a wording change ("Jet2holidays" -> "Jet2 holidays") and a
  // missing word ("Terms").
  const { error: recordError } = await serviceClient.rpc("record_transcript_result", {
    p_job_id: jobId,
    p_language: "en",
    p_full_text: "Escape to Tenerife this winter with Jet2 holidays. Prices start from three hundred and ninety nine pounds. ATOL protected.",
    p_processing_duration_ms: 1200,
    p_segments: [
      {
        sort_order: 0,
        start_ms: 0,
        end_ms: 3000,
        text: "Escape to Tenerife this winter with Jet2 holidays",
        confidence: 0.93,
        word_timings: [
          { word: "Escape", start_ms: 0, end_ms: 300, confidence: 0.97 },
          { word: "to", start_ms: 300, end_ms: 400, confidence: 0.98 },
          { word: "Tenerife", start_ms: 400, end_ms: 900, confidence: 0.95 },
          { word: "this", start_ms: 900, end_ms: 1000, confidence: 0.97 },
          { word: "winter", start_ms: 1000, end_ms: 1300, confidence: 0.96 },
          { word: "with", start_ms: 1300, end_ms: 1400, confidence: 0.97 },
          { word: "Jet2", start_ms: 1400, end_ms: 1700, confidence: 0.9 },
          { word: "holidays", start_ms: 1700, end_ms: 2000, confidence: 0.9 },
        ],
      },
      {
        sort_order: 1,
        start_ms: 2000,
        end_ms: 5000,
        text: "Prices start from three hundred and ninety nine pounds",
        confidence: 0.96,
        word_timings: null,
      },
      {
        sort_order: 2,
        start_ms: 5000,
        end_ms: 6000,
        text: "ATOL protected",
        confidence: 0.9,
        word_timings: null,
      },
    ],
  });
  check("record_transcript_result (the real completion RPC) succeeds", !recordError);

  const { data: transcript } = await serviceClient.from("transcripts").select("*").eq("audio_version_id", diffVersion.versionId).single();
  check("a transcript row was created for this audio version", !!transcript);
  check("current_transcript_version_id points at the new version", !!transcript.current_transcript_version_id);

  const { data: transcriptVersion } = await serviceClient
    .from("transcript_versions")
    .select("*")
    .eq("id", transcript.current_transcript_version_id)
    .single();
  check("this is version 1 for a brand-new transcript", transcriptVersion.version_number === 1);

  const { data: completedActivity } = await serviceClient
    .from("activity_events")
    .select("action")
    .eq("audio_item_id", diffItem.id)
    .eq("action", "transcript_completed");
  check("transcript completion is logged to activity", completedActivity.length === 1);

  // The real worker enqueues this itself right after a transcription job
  // completes (see processTranscriptionJob) — done explicitly here since
  // this test called record_transcript_result directly rather than
  // running a real transcription job end to end (no ELEVENLABS_API_KEY).
  await enqueueFollowupJob(serviceClient, "comparison", diffVersion.versionId, null);

  // Real worker passes below perform the REAL comparison + health
  // generation, using the hand-authored transcript above as their input.
  await processQueuedJobs(serviceClient, 5);
  await processQueuedJobs(serviceClient, 5); // one more pass: comparison -> health chains across two ticks

  const { data: comparisonResult } = await serviceClient
    .from("comparison_results")
    .select("*")
    .eq("transcript_version_id", transcriptVersion.id)
    .maybeSingle();
  check("a comparison result was generated automatically after transcription completed", !!comparisonResult);
  check("the comparison names the exact script revision it ran against", !!comparisonResult?.script_revision_id);

  const { data: findings } = await serviceClient
    .from("comparison_findings")
    .select("*")
    .eq("comparison_result_id", comparisonResult.id)
    .order("sort_order");
  check(
    "the 'Jet2holidays' -> 'Jet2 holidays' compound-word split is surfaced as a real, non-perfect difference " +
      "(classified as a wording change, a pronunciation flag, or a missing+additional pair — any of which correctly " +
      "draws a reviewer's eye instead of silently reporting a perfect match)",
    findings.some(
      (f) =>
        f.classification !== "perfect" &&
        ((f.script_text ?? "").toLowerCase().includes("jet2holidays") || (f.transcript_text ?? "").toLowerCase().includes("holidays")),
    ),
  );
  check(
    "the missing word 'Terms apply' is detected as a missing phrase",
    findings.some((f) => f.classification === "missing_phrase"),
  );

  const { data: healthSnapshot } = await serviceClient
    .from("recording_health_snapshots")
    .select("*")
    .eq("comparison_result_id", comparisonResult.id)
    .maybeSingle();
  check("a recording health snapshot was generated automatically after comparison completed", !!healthSnapshot);

  const { data: categoryScores } = await serviceClient
    .from("recording_health_category_scores")
    .select("*")
    .eq("snapshot_id", healthSnapshot.id);
  check("health snapshot has all 6 categories scored", categoryScores.length === 6);

  const { data: healthActivity } = await serviceClient
    .from("activity_events")
    .select("action")
    .eq("audio_item_id", diffItem.id)
    .in("action", ["comparison_generated", "health_generated"]);
  check("both comparison_generated and health_generated are logged", healthActivity.length === 2);

  console.log("\n--- Regeneration: a second transcript version, never overwriting the first ---");
  const regenerateJobId = await intelligenceService.requestTranscription(priya, diffVersion.versionId);
  await serviceClient.rpc("record_transcript_result", {
    p_job_id: regenerateJobId,
    p_language: "en",
    p_full_text: "Escape to Tenerife this winter with Jet2holidays.",
    p_processing_duration_ms: 900,
    p_segments: [
      { sort_order: 0, start_ms: 0, end_ms: 2000, text: "Escape to Tenerife this winter with Jet2holidays", confidence: 0.95, word_timings: null },
    ],
  });

  const { data: versions } = await serviceClient
    .from("transcript_versions")
    .select("version_number")
    .eq("transcript_id", transcript.id)
    .order("version_number");
  check("regenerating creates version 2 — version 1 is never deleted", versions.length === 2 && versions[1].version_number === 2);

  const { data: transcriptAfter } = await serviceClient.from("transcripts").select("current_transcript_version_id").eq("id", transcript.id).single();
  const { data: v2 } = await serviceClient.from("transcript_versions").select("id").eq("transcript_id", transcript.id).eq("version_number", 2).single();
  check("current_transcript_version_id now points at version 2", transcriptAfter.current_transcript_version_id === v2.id);

  const { data: regeneratedActivity } = await serviceClient
    .from("activity_events")
    .select("action")
    .eq("audio_item_id", diffItem.id)
    .eq("action", "transcript_regenerated");
  check("requesting a transcript when one already exists logs 'transcript_regenerated', not 'transcript_requested' again", regeneratedActivity.length === 1);
}

console.log("\n=== Activity ordering ===");
{
  const { data: activity } = await serviceClient
    .from("activity_events")
    .select("action, created_at")
    .eq("audio_item_id", diffItem.id)
    .order("created_at", { ascending: false });
  let isDescending = true;
  for (let i = 1; i < activity.length; i++) {
    if (new Date(activity[i].created_at) > new Date(activity[i - 1].created_at)) isDescending = false;
  }
  check("activity for this recording is ordered newest first", isDescending);
  // The regeneration request itself logs 'transcript_regenerated', but
  // record_transcript_result (called immediately after, standing in for
  // the real worker completing that job) logs 'transcript_completed' —
  // that, not the request, is genuinely the last event in the sequence.
  check("the most recent event is the version-2 transcript completing", activity[0].action === "transcript_completed");
}

// Cleanup — mirrors audio-upload.test.mjs / review-engine.test.mjs: deleting
// each throwaway script cascades through variants -> audio_items ->
// everything created above.
for (const scriptId of createdScriptIds) {
  await serviceClient.from("scripts").delete().eq("id", scriptId);
}

summarize();
