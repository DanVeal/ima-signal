/**
 * The background worker — "Move AI work off request threads" implemented
 * as a Postgres-backed durable queue (ai_jobs, claimed via `FOR UPDATE
 * SKIP LOCKED`) plus an in-process poller. There is no external queue
 * service in this stack (no Redis/BullMQ/etc — see docs/audio-
 * foundation.md's precedent of building bounded-concurrency mechanisms
 * out of what Postgres + Node already give us), so `processQueuedJobs`
 * IS the worker: one deterministic pass that claims and executes whatever
 * work is queued. `src/instrumentation.ts` calls it on an interval when
 * the Next.js server boots; tests call it directly for deterministic,
 * timer-free assertions — see supabase/tests/intelligence-engine.test.mjs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { getScriptLinesForAudioItem } from "@/lib/review/queries";
import { ELEVENLABS_MODEL, ELEVENLABS_PROVIDER, mimeTypeForContainer, transcribeAudio } from "./elevenlabs";
import { compareScriptToTranscript, type ComparisonFinding, type TranscriptSegmentInput } from "./comparison";
import { categorizePronunciationWord } from "./pronunciation";
import { generateHealthSnapshot } from "./health";
import { splitWords } from "./text";

type Client = SupabaseClient<Database>;
type AiJobType = Database["public"]["Enums"]["ai_job_type"];
type AiJobRow = Database["public"]["Tables"]["ai_jobs"]["Row"];

const BUCKET = "audio-recordings";
const SEGMENT_MAX_WORDS = 15;
const SEGMENT_SILENCE_GAP_MS = 600;

export interface WorkerPassSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

/** One deterministic pass over the queue: claim up to `limit` jobs of each type, run each to completion or failure. Never throws — every per-job error is caught and recorded via fail_ai_job. */
export async function processQueuedJobs(client: Client, limit = 5): Promise<WorkerPassSummary> {
  const summary: WorkerPassSummary = { claimed: 0, succeeded: 0, failed: 0 };

  for (const jobType of ["transcription", "comparison", "health"] as AiJobType[]) {
    const { data: jobs, error } = await client.rpc("claim_next_ai_jobs", { p_job_type: jobType, p_limit: limit });
    if (error) throw error;
    for (const job of jobs ?? []) {
      summary.claimed += 1;
      try {
        if (jobType === "transcription") await processTranscriptionJob(client, job);
        else if (jobType === "comparison") await processComparisonJob(client, job);
        else await processHealthJob(client, job);
        summary.succeeded += 1;
      } catch (err) {
        summary.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        await client.rpc("fail_ai_job", { p_job_id: job.id, p_error: message });
      }
    }
  }

  return summary;
}

/** Runs `processQueuedJobs` on an interval using the service-role client — started once from src/instrumentation.ts when the Next.js server boots. */
export function startWorkerPolling(intervalMs = 5000): () => void {
  const client = createServiceClient();
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processQueuedJobs(client)
      .catch((err) => console.error("[ai-worker] pass failed:", err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  return () => clearInterval(timer);
}

// ── Transcription ────────────────────────────────────────────────────────

interface PendingSegment {
  words: { word: string; startMs: number; endMs: number; confidence: number | null }[];
}

function segmentWords(words: { word: string; startMs: number; endMs: number; confidence: number | null }[]): PendingSegment[] {
  const segments: PendingSegment[] = [];
  let current: PendingSegment | null = null;

  for (const word of words) {
    const gapFromPrevious = current ? word.startMs - current.words[current.words.length - 1].endMs : 0;
    const endsSentence = current && /[.?!]$/.test(current.words[current.words.length - 1].word);
    if (!current || gapFromPrevious > SEGMENT_SILENCE_GAP_MS || current.words.length >= SEGMENT_MAX_WORDS || endsSentence) {
      current = { words: [] };
      segments.push(current);
    }
    current.words.push(word);
  }
  return segments;
}

async function processTranscriptionJob(client: Client, job: AiJobRow): Promise<void> {
  const { data: audioVersion, error: versionError } = await client
    .from("audio_versions")
    .select("storage_path, original_filename, codec, container_format")
    .eq("id", job.audio_version_id)
    .single();
  if (versionError) throw versionError;

  const { data: blob, error: downloadError } = await client.storage.from(BUCKET).download(audioVersion.storage_path);
  if (downloadError) throw downloadError;
  const buffer = Buffer.from(await blob.arrayBuffer());

  const startedAt = Date.now();
  const result = await transcribeAudio(
    buffer,
    audioVersion.original_filename,
    mimeTypeForContainer(audioVersion.container_format, audioVersion.codec),
  );
  const processingDurationMs = Date.now() - startedAt;

  const segments = segmentWords(result.words);
  const payload = segments.map((segment, index) => ({
    sort_order: index,
    start_ms: segment.words[0].startMs,
    end_ms: segment.words[segment.words.length - 1].endMs,
    text: segment.words.map((w) => w.word).join(" "),
    confidence: average(segment.words.map((w) => w.confidence).filter((c): c is number => c != null)),
    word_timings: segment.words.map((w) => ({ word: w.word, start_ms: w.startMs, end_ms: w.endMs, confidence: w.confidence })),
  }));

  const { error: recordError } = await client.rpc("record_transcript_result", {
    p_job_id: job.id,
    p_language: result.language as string,
    p_full_text: result.text,
    p_processing_duration_ms: processingDurationMs,
    p_segments: payload,
  });
  if (recordError) throw recordError;

  // Best-effort chain: a comparison job becomes available as soon as a
  // transcript exists. Swallow "already live" — request_transcription-
  // style idempotency, not a failure of this job.
  await enqueueFollowupJob(client, "comparison", job.audio_version_id, job.requested_by_user_id);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Exported for tests that stand in for a completed provider call (see supabase/tests/intelligence-engine.test.mjs) — the real worker only ever calls this internally, right after a transcription/comparison job completes. */
export async function enqueueFollowupJob(
  client: Client,
  jobType: AiJobType,
  audioVersionId: string,
  requestedByUserId: string | null,
): Promise<void> {
  const modelId = await ensureModelMetadata(client, jobType);
  const { error } = await client
    .from("ai_jobs")
    .insert({ job_type: jobType, audio_version_id: audioVersionId, requested_by_user_id: requestedByUserId, ai_model_metadata_id: modelId });
  // A unique_violation here means a live job already exists for this
  // target — exactly the idempotency guarantee ai_jobs_one_live_per_
  // target_idx exists for; anything else is a real problem.
  if (error && error.code !== "23505") throw error;
}

async function ensureModelMetadata(client: Client, jobType: AiJobType): Promise<string> {
  const config =
    jobType === "transcription"
      ? { provider: ELEVENLABS_PROVIDER, model: ELEVENLABS_MODEL, modelVersion: null, promptVersion: null }
      : { provider: "ima-signal", model: jobType === "comparison" ? "comparison-heuristic" : "health-heuristic", modelVersion: "v1", promptVersion: null };

  const { data, error } = await client.rpc("ensure_ai_model_metadata", {
    p_provider: config.provider,
    p_model: config.model,
    p_model_version: config.modelVersion as unknown as string,
    p_prompt_version: config.promptVersion as unknown as string,
  });
  if (error) throw error;
  return data as unknown as string;
}

// ── Comparison ───────────────────────────────────────────────────────────

async function processComparisonJob(client: Client, job: AiJobRow): Promise<void> {
  const { data: audioVersion, error: versionError } = await client
    .from("audio_versions")
    .select("audio_item_id")
    .eq("id", job.audio_version_id)
    .single();
  if (versionError) throw versionError;

  const { data: transcript, error: transcriptError } = await client
    .from("transcripts")
    .select("current_transcript_version_id")
    .eq("audio_version_id", job.audio_version_id)
    .maybeSingle();
  if (transcriptError) throw transcriptError;
  if (!transcript?.current_transcript_version_id) {
    throw new Error("no completed transcript is available yet for this recording version");
  }
  const transcriptVersionId = transcript.current_transcript_version_id;

  const scriptData = await getScriptLinesForAudioItem(client, audioVersion.audio_item_id);
  if (scriptData.kind !== "script_revision") {
    throw new Error(
      scriptData.kind === "none"
        ? "no approved script revision exists yet to compare against"
        : "comparison currently supports Standard Radio script revisions only",
    );
  }

  const { data: segmentRows, error: segmentsError } = await client
    .from("transcript_segments")
    .select("*")
    .eq("transcript_version_id", transcriptVersionId)
    .order("sort_order");
  if (segmentsError) throw segmentsError;

  const transcriptSegments: TranscriptSegmentInput[] = segmentRows.map((s) => ({
    sortOrder: s.sort_order,
    startMs: s.start_ms,
    endMs: s.end_ms,
    text: s.text,
    confidence: s.confidence != null ? Number(s.confidence) : null,
    wordTimings: Array.isArray(s.word_timings)
      ? (s.word_timings as unknown as { word: string; start_ms: number; end_ms: number; confidence: number | null }[]).map((w) => ({
          word: w.word,
          startMs: w.start_ms,
          endMs: w.end_ms,
          confidence: w.confidence,
        }))
      : null,
  }));

  const outcome = compareScriptToTranscript(
    scriptData.lines.map((l) => ({ sortOrder: l.sortOrder, text: l.text })),
    transcriptSegments,
  );

  const segmentIdBySortOrder = new Map(segmentRows.map((s) => [s.sort_order, s.id]));
  const findingsPayload = outcome.findings.map((f: ComparisonFinding) => ({
    sort_order: f.sortOrder,
    classification: f.classification,
    script_line_sort_order: f.scriptLineSortOrder,
    script_text: f.scriptText,
    transcript_segment_id: f.transcriptSegmentSortOrder != null ? (segmentIdBySortOrder.get(f.transcriptSegmentSortOrder) ?? null) : null,
    transcript_text: f.transcriptText,
    start_ms: f.startMs,
    end_ms: f.endMs,
    confidence: f.confidence,
  }));

  const pronunciationPayload = outcome.pronunciationCandidates.map((p) => ({
    comparison_finding_index: p.comparisonFindingIndex,
    transcript_segment_id: p.transcriptSegmentSortOrder != null ? (segmentIdBySortOrder.get(p.transcriptSegmentSortOrder) ?? null) : null,
    word: p.word,
    category: categorizePronunciationWord(p.word),
    confidence: p.confidence,
    start_ms: p.startMs,
    end_ms: p.endMs,
  }));

  const { error: recordError } = await client.rpc("record_comparison_result", {
    p_job_id: job.id,
    p_transcript_version_id: transcriptVersionId,
    p_script_revision_id: scriptData.revisionId,
    p_match_ratio: outcome.matchRatio,
    p_findings: findingsPayload,
    p_pronunciation_findings: pronunciationPayload,
  });
  if (recordError) throw recordError;

  await enqueueFollowupJob(client, "health", job.audio_version_id, job.requested_by_user_id);
}

// ── Health ───────────────────────────────────────────────────────────────

async function processHealthJob(client: Client, job: AiJobRow): Promise<void> {
  const { data: audioVersion, error: versionError } = await client
    .from("audio_versions")
    .select("audio_item_id, waveform_peaks")
    .eq("id", job.audio_version_id)
    .single();
  if (versionError) throw versionError;

  const { data: transcript, error: transcriptError } = await client
    .from("transcripts")
    .select("current_transcript_version_id")
    .eq("audio_version_id", job.audio_version_id)
    .maybeSingle();
  if (transcriptError) throw transcriptError;
  const transcriptVersionId = transcript?.current_transcript_version_id;
  if (!transcriptVersionId) throw new Error("no completed transcript is available yet for this recording version");

  const { data: comparisonResult, error: comparisonError } = await client
    .from("comparison_results")
    .select("*")
    .eq("transcript_version_id", transcriptVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (comparisonError) throw comparisonError;
  if (!comparisonResult) throw new Error("no comparison is available yet for this transcript version");

  const { data: findingRows, error: findingsError } = await client
    .from("comparison_findings")
    .select("*")
    .eq("comparison_result_id", comparisonResult.id);
  if (findingsError) throw findingsError;

  const { count: pronunciationCount, error: pronunciationError } = await client
    .from("pronunciation_findings")
    .select("id", { count: "exact", head: true })
    .eq("transcript_version_id", transcriptVersionId);
  if (pronunciationError) throw pronunciationError;

  const { data: segmentRows, error: segmentsError } = await client
    .from("transcript_segments")
    .select("confidence")
    .eq("transcript_version_id", transcriptVersionId);
  if (segmentsError) throw segmentsError;

  const scriptData = await getScriptLinesForAudioItem(client, audioVersion.audio_item_id);
  const scriptWordCount =
    scriptData.kind === "script_revision" ? scriptData.lines.reduce((sum, l) => sum + splitWords(l.text ?? "").length, 0) : 0;

  const findings: ComparisonFinding[] = findingRows.map((f) => ({
    sortOrder: f.sort_order,
    classification: f.classification,
    scriptLineSortOrder: f.script_line_sort_order,
    scriptText: f.script_text,
    transcriptSegmentSortOrder: null,
    transcriptText: f.transcript_text,
    startMs: f.start_ms,
    endMs: f.end_ms,
    confidence: f.confidence != null ? Number(f.confidence) : null,
  }));

  const outcome = generateHealthSnapshot({
    matchRatio: Number(comparisonResult.match_ratio),
    findings,
    pronunciationFindingCount: pronunciationCount ?? 0,
    scriptWordCount,
    confidenceSamples: segmentRows.map((s) => (s.confidence != null ? Number(s.confidence) : null)).filter((c): c is number => c != null),
    waveformPeaks: audioVersion.waveform_peaks as number[] | null,
  });

  const { error: recordError } = await client.rpc("record_health_snapshot", {
    p_job_id: job.id,
    p_transcript_version_id: transcriptVersionId,
    p_comparison_result_id: comparisonResult.id,
    p_overall_rating: outcome.overallRating,
    p_category_scores: outcome.categoryScores.map((c) => ({ category: c.category, rating: c.rating, summary: c.summary })),
  });
  if (recordError) throw recordError;
}
