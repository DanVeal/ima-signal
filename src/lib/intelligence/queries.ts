/**
 * Read queries for the Intelligence Engine — transcripts, comparisons,
 * pronunciation findings, recording health, and AI job status for the
 * recording page. Same pattern as review/queries.ts: plain functions
 * taking a Supabase client, RLS enforces access, nothing here writes
 * anything (see service.ts for mutations, all of which go through the RPC
 * functions in 20260731130100_intelligence_functions.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getUploaderNames } from "@/lib/audio/queries";

type Client = SupabaseClient<Database>;
type AiJobStatus = Database["public"]["Enums"]["ai_job_status"];
type AiJobType = Database["public"]["Enums"]["ai_job_type"];
type DiffClassification = Database["public"]["Enums"]["diff_classification"];
type HealthRating = Database["public"]["Enums"]["health_rating"];
type HealthCategory = Database["public"]["Enums"]["health_category"];
type PronunciationCategory = Database["public"]["Enums"]["pronunciation_category"];

// ── AI jobs ─────────────────────────────────────────────────────────────

export interface AiJobSummary {
  id: string;
  jobType: AiJobType;
  status: AiJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  requestedByUserId: string | null;
  requestedByName: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function getAiJobsForAudioVersion(supabase: Client, audioVersionId: string): Promise<AiJobSummary[]> {
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("*")
    .eq("audio_version_id", audioVersionId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await getUploaderNames(supabase, data.map((j) => j.requested_by_user_id));
  return data.map((j) => ({
    id: j.id,
    jobType: j.job_type,
    status: j.status,
    attempts: j.attempts,
    maxAttempts: j.max_attempts,
    lastError: j.last_error,
    requestedByUserId: j.requested_by_user_id,
    requestedByName: j.requested_by_user_id ? (names.get(j.requested_by_user_id)?.fullName ?? "Unknown") : null,
    createdAt: j.created_at,
    startedAt: j.started_at,
    completedAt: j.completed_at,
  }));
}

// ── Transcripts ─────────────────────────────────────────────────────────

export interface TranscriptSegment {
  id: string;
  sortOrder: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  wordTimings: { word: string; startMs: number; endMs: number; confidence: number | null }[] | null;
}

export interface TranscriptVersionSummary {
  id: string;
  versionNumber: number;
  language: string | null;
  fullText: string;
  processingDurationMs: number | null;
  generatedAt: string;
  provider: string;
  model: string;
}

export interface TranscriptDetail {
  transcriptId: string;
  currentVersion: TranscriptVersionSummary | null;
  segments: TranscriptSegment[];
  versionHistory: TranscriptVersionSummary[];
}

function toWordTimings(raw: unknown): TranscriptSegment["wordTimings"] {
  if (!Array.isArray(raw)) return null;
  return (raw as { word: string; start_ms: number; end_ms: number; confidence: number | null }[]).map((w) => ({
    word: w.word,
    startMs: w.start_ms,
    endMs: w.end_ms,
    confidence: w.confidence,
  }));
}

export async function getTranscriptForAudioVersion(supabase: Client, audioVersionId: string): Promise<TranscriptDetail | null> {
  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("id, current_transcript_version_id")
    .eq("audio_version_id", audioVersionId)
    .maybeSingle();
  if (transcriptError) throw transcriptError;
  if (!transcript) return null;

  const { data: versions, error: versionsError } = await supabase
    .from("transcript_versions")
    .select("*, ai_model_metadata(provider, model)")
    .eq("transcript_id", transcript.id)
    .order("version_number", { ascending: false });
  if (versionsError) throw versionsError;

  const versionHistory: TranscriptVersionSummary[] = versions.map((v) => ({
    id: v.id,
    versionNumber: v.version_number,
    language: v.language,
    fullText: v.full_text,
    processingDurationMs: v.processing_duration_ms,
    generatedAt: v.generated_at,
    provider: v.ai_model_metadata?.provider ?? "unknown",
    model: v.ai_model_metadata?.model ?? "unknown",
  }));

  const currentVersion = versionHistory.find((v) => v.id === transcript.current_transcript_version_id) ?? null;

  let segments: TranscriptSegment[] = [];
  if (currentVersion) {
    const { data: segmentRows, error: segmentsError } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("transcript_version_id", currentVersion.id)
      .order("sort_order");
    if (segmentsError) throw segmentsError;
    segments = segmentRows.map((s) => ({
      id: s.id,
      sortOrder: s.sort_order,
      startMs: s.start_ms,
      endMs: s.end_ms,
      text: s.text,
      confidence: s.confidence != null ? Number(s.confidence) : null,
      wordTimings: toWordTimings(s.word_timings),
    }));
  }

  return { transcriptId: transcript.id, currentVersion, segments, versionHistory };
}

// ── Comparison ──────────────────────────────────────────────────────────

export interface ComparisonFindingRow {
  id: string;
  sortOrder: number;
  classification: DiffClassification;
  scriptLineSortOrder: number | null;
  scriptText: string | null;
  transcriptSegmentId: string | null;
  transcriptText: string | null;
  startMs: number | null;
  endMs: number | null;
  confidence: number | null;
}

export interface ComparisonDetail {
  id: string;
  matchRatio: number;
  generatedAt: string;
  scriptRevisionId: string;
  transcriptVersionId: string;
  findings: ComparisonFindingRow[];
}

export async function getComparisonForTranscriptVersion(supabase: Client, transcriptVersionId: string): Promise<ComparisonDetail | null> {
  const { data: result, error: resultError } = await supabase
    .from("comparison_results")
    .select("*")
    .eq("transcript_version_id", transcriptVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (resultError) throw resultError;
  if (!result) return null;

  const { data: findingRows, error: findingsError } = await supabase
    .from("comparison_findings")
    .select("*")
    .eq("comparison_result_id", result.id)
    .order("sort_order");
  if (findingsError) throw findingsError;

  return {
    id: result.id,
    matchRatio: Number(result.match_ratio),
    generatedAt: result.generated_at,
    scriptRevisionId: result.script_revision_id,
    transcriptVersionId: result.transcript_version_id,
    findings: findingRows.map((f) => ({
      id: f.id,
      sortOrder: f.sort_order,
      classification: f.classification,
      scriptLineSortOrder: f.script_line_sort_order,
      scriptText: f.script_text,
      transcriptSegmentId: f.transcript_segment_id,
      transcriptText: f.transcript_text,
      startMs: f.start_ms,
      endMs: f.end_ms,
      confidence: f.confidence != null ? Number(f.confidence) : null,
    })),
  };
}

// ── Pronunciation ───────────────────────────────────────────────────────

export interface PronunciationFindingRow {
  id: string;
  word: string;
  category: PronunciationCategory;
  confidence: number | null;
  startMs: number | null;
  endMs: number | null;
  transcriptSegmentId: string | null;
}

export async function getPronunciationFindings(supabase: Client, transcriptVersionId: string): Promise<PronunciationFindingRow[]> {
  const { data, error } = await supabase
    .from("pronunciation_findings")
    .select("*")
    .eq("transcript_version_id", transcriptVersionId)
    .order("start_ms");
  if (error) throw error;
  return data.map((p) => ({
    id: p.id,
    word: p.word,
    category: p.category,
    confidence: p.confidence != null ? Number(p.confidence) : null,
    startMs: p.start_ms,
    endMs: p.end_ms,
    transcriptSegmentId: p.transcript_segment_id,
  }));
}

// ── Recording Health ────────────────────────────────────────────────────

export interface HealthCategoryScoreRow {
  category: HealthCategory;
  rating: HealthRating;
  summary: string;
}

export interface HealthSnapshotDetail {
  id: string;
  overallRating: HealthRating;
  generatedAt: string;
  categoryScores: HealthCategoryScoreRow[];
}

export async function getHealthSnapshotForAudioVersion(supabase: Client, audioVersionId: string): Promise<HealthSnapshotDetail | null> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from("recording_health_snapshots")
    .select("*")
    .eq("audio_version_id", audioVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot) return null;

  const { data: scores, error: scoresError } = await supabase
    .from("recording_health_category_scores")
    .select("category, rating, summary")
    .eq("snapshot_id", snapshot.id);
  if (scoresError) throw scoresError;

  return { id: snapshot.id, overallRating: snapshot.overall_rating, generatedAt: snapshot.generated_at, categoryScores: scores };
}

// ── Permissions ─────────────────────────────────────────────────────────

export interface AiPermissions {
  canGenerate: boolean;
}

export async function getAiPermissions(supabase: Client, projectId: string): Promise<AiPermissions> {
  const { data, error } = await supabase.rpc("can_generate_ai_work", { target_project_id: projectId });
  if (error) throw error;
  return { canGenerate: data ?? false };
}

// ── Batch summaries for the recordings browse page / bulk queue ─────────

export interface AiJobBatchStatus {
  jobId: string;
  jobType: AiJobType;
  status: AiJobStatus;
}

/** The latest AI job (any type) per audio_version_id, for showing a status chip per row on the browse page without opening each recording. */
export async function getLatestAiJobsByAudioVersionIds(
  supabase: Client,
  audioVersionIds: string[],
): Promise<Map<string, AiJobBatchStatus>> {
  const ids = Array.from(new Set(audioVersionIds));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("id, job_type, status, audio_version_id, created_at")
    .in("audio_version_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const map = new Map<string, AiJobBatchStatus>();
  for (const row of data) {
    if (!map.has(row.audio_version_id)) {
      map.set(row.audio_version_id, { jobId: row.id, jobType: row.job_type, status: row.status });
    }
  }
  return map;
}

/** The latest recording health rating per audio_version_id, for the same browse-page purpose. */
export async function getHealthRatingsByAudioVersionIds(supabase: Client, audioVersionIds: string[]): Promise<Map<string, HealthRating>> {
  const ids = Array.from(new Set(audioVersionIds));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("recording_health_snapshots")
    .select("audio_version_id, overall_rating, created_at")
    .in("audio_version_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const map = new Map<string, HealthRating>();
  for (const row of data) {
    if (!map.has(row.audio_version_id)) map.set(row.audio_version_id, row.overall_rating);
  }
  return map;
}
