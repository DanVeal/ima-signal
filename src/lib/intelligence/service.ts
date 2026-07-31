/**
 * Intelligence Engine mutations — thin wrappers over the RPC functions in
 * 20260731130100_intelligence_functions.sql, same pattern as
 * review/service.ts. Every function here only ever ENQUEUES or CANCELS/
 * RETRIES a job — the actual AI work happens in src/lib/ai/worker.ts,
 * never on a request thread.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export async function requestTranscription(supabase: Client, audioVersionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("request_transcription", { p_audio_version_id: audioVersionId });
  if (error) throw error;
  return data;
}

export interface BulkTranscriptionResult {
  audioVersionId: string;
  aiJobId: string;
}

export async function requestBulkTranscription(supabase: Client, audioVersionIds: string[]): Promise<BulkTranscriptionResult[]> {
  const { data, error } = await supabase.rpc("request_bulk_transcription", { p_audio_version_ids: audioVersionIds });
  if (error) throw error;
  return data.map((row) => ({ audioVersionId: row.audio_version_id, aiJobId: row.ai_job_id }));
}

export async function cancelAiJob(supabase: Client, jobId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_ai_job", { p_job_id: jobId });
  if (error) throw error;
}

export async function retryAiJob(supabase: Client, jobId: string): Promise<void> {
  const { error } = await supabase.rpc("retry_ai_job", { p_job_id: jobId });
  if (error) throw error;
}
