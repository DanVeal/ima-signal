"use server";

/**
 * Thin "use server" wrappers around service.ts — every call runs as the
 * signed-in user's own request-scoped Supabase client, so RLS is the real
 * gate (mirrors review/actions.ts). After enqueueing, each action fires an
 * UNAWAITED worker pass as a "kick" so a queued job doesn't have to wait
 * for the next interval tick — deliberately not awaited, so a slow (or,
 * with a real API key, genuinely long-running) transcription never blocks
 * this request/response cycle. The interval poller in
 * src/instrumentation.ts is what actually guarantees the work completes
 * even if this kick is skipped or the process restarts mid-flight.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { processQueuedJobs } from "@/lib/ai/worker";
import * as service from "./service";

function kickWorker() {
  const client = createServiceClient();
  void processQueuedJobs(client).catch((err) => console.error("[ai-worker] kick failed:", err));
}

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

export async function requestTranscription(audioVersionId: string, audioItemId: string) {
  const supabase = await createClient();
  const jobId = await service.requestTranscription(supabase, audioVersionId);
  kickWorker();
  await revalidateRecordingPage(audioItemId);
  return { jobId };
}

export async function requestBulkTranscription(audioVersionIds: string[]) {
  const supabase = await createClient();
  const results = await service.requestBulkTranscription(supabase, audioVersionIds);
  kickWorker();
  return { results };
}

export async function cancelAiJob(jobId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.cancelAiJob(supabase, jobId);
  await revalidateRecordingPage(audioItemId);
}

export async function retryAiJob(jobId: string, audioItemId: string) {
  const supabase = await createClient();
  await service.retryAiJob(supabase, jobId);
  kickWorker();
  await revalidateRecordingPage(audioItemId);
}
