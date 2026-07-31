"use server";

/**
 * Thin "use server" wrappers around service.ts — every call here runs as
 * the signed-in user's own request-scoped Supabase client (server.ts),
 * never the service role, so RLS is the real gate throughout. The actual
 * logic lives in service.ts (a plain client-first function per operation,
 * same shape as repository.ts) specifically so it can be exercised
 * directly in tests with a real signed-in client — see
 * supabase/tests/upload.test.mjs.
 */
import { createClient } from "@/lib/supabase/server";
import * as service from "./service";
import type { UploadSubject } from "./service";

export async function getMatchTargetsForProject(projectId: string) {
  const supabase = await createClient();
  return service.getMatchTargetsForProject(supabase, projectId);
}

export async function requestUploadSlot(subject: UploadSubject, originalFilename: string) {
  const supabase = await createClient();
  return service.requestUploadSlot(supabase, subject, originalFilename);
}

export async function finalizeUpload(audioItemId: string, storagePath: string, originalFilename: string) {
  const supabase = await createClient();
  return service.finalizeUpload(supabase, audioItemId, storagePath, originalFilename);
}

export async function restoreAudioVersion(audioVersionId: string) {
  const supabase = await createClient();
  const versionId = await service.restoreAudioVersion(supabase, audioVersionId);
  return { versionId };
}

export async function getPlaybackUrl(storagePath: string) {
  const supabase = await createClient();
  return service.getPlaybackUrl(supabase, storagePath);
}
