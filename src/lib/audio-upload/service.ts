/**
 * Audio upload service layer — plain functions taking a Supabase client as
 * their first argument (same pattern as repository.ts / import-service.ts),
 * so callers control identity (browser/session, server/session,
 * service-role) and RLS enforces the rest. Kept separate from
 * actions.ts's "use server" boundary specifically so this is directly
 * unit/integration-testable with a real signed-in client, the same way
 * Phase 2B's wording/import services are tested.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { processUploadedAudio } from "@/lib/audio/process-upload";
import type { MatchTarget } from "./matcher";

type Client = SupabaseClient<Database>;

const BUCKET = "audio-recordings";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}

export interface UploadSubject {
  scriptVariantId?: string;
  announcementVersionId?: string;
}

/** All match targets (variants or announcement versions) for a project, with each one's current recording's checksum for duplicate detection. */
export async function getMatchTargetsForProject(supabase: Client, projectId: string): Promise<MatchTarget[]> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("type")
    .eq("id", projectId)
    .single();
  if (projectError) throw projectError;

  if (project.type === "standard_radio") {
    const { data, error } = await supabase
      .from("script_variants")
      .select(
        "id, variant_code, destination, departure_airport, column_order, script:scripts(project_id), audio_item:audio_items(current_version:audio_versions!audio_items_current_version_id_fkey(file_checksum))",
      )
      .order("column_order");
    if (error) throw error;
    return data
      .filter((v) => v.script?.project_id === projectId)
      .map((v) => ({
        subjectId: v.id,
        subjectType: "script_variant" as const,
        code: v.variant_code,
        label: [v.variant_code, [v.departure_airport, v.destination].filter(Boolean).join(" → ")]
          .filter(Boolean)
          .join(" — "),
        currentChecksum: v.audio_item?.current_version?.file_checksum ?? null,
      }));
  }

  const { data, error } = await supabase
    .from("prams_announcement_versions")
    .select(
      "id, title_at_import, project_id, status, column_order, announcement:prams_announcements(reference_code), audio_item:audio_items(current_version:audio_versions!audio_items_current_version_id_fkey(file_checksum))",
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("column_order");
  if (error) throw error;
  return data.map((v) => ({
    subjectId: v.id,
    subjectType: "announcement_version" as const,
    code: v.announcement?.reference_code ?? "",
    label: `${v.announcement?.reference_code ?? "?"} — ${v.title_at_import}`,
    currentChecksum: v.audio_item?.current_version?.file_checksum ?? null,
  }));
}

export interface UploadSlot {
  audioItemId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
}

async function resolveProjectId(supabase: Client, subject: UploadSubject): Promise<string> {
  if (subject.scriptVariantId) {
    const { data, error } = await supabase
      .from("script_variants")
      .select("script:scripts(project_id)")
      .eq("id", subject.scriptVariantId)
      .single();
    if (error) throw error;
    if (!data.script?.project_id) throw new Error("Could not resolve project for script variant");
    return data.script.project_id;
  }
  const { data, error } = await supabase
    .from("prams_announcement_versions")
    .select("project_id")
    .eq("id", subject.announcementVersionId!)
    .single();
  if (error) throw error;
  return data.project_id;
}

/** Finds-or-creates the audio_item for a subject, then issues a signed upload URL. Both steps are RLS-checked — an unauthorised caller fails here, before a single byte moves. */
export async function requestUploadSlot(
  supabase: Client,
  subject: UploadSubject,
  originalFilename: string,
): Promise<UploadSlot> {
  const column = subject.scriptVariantId ? "script_variant_id" : "announcement_version_id";
  const value = subject.scriptVariantId ?? subject.announcementVersionId;
  if (!value) throw new Error("Must supply exactly one of scriptVariantId or announcementVersionId");

  let audioItemId: string;
  const { data: existing } = await supabase.from("audio_items").select("id").eq(column, value).maybeSingle();
  if (existing) {
    audioItemId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("audio_items")
      .insert({ [column]: value })
      .select("id")
      .single();
    if (insertError) throw insertError;
    audioItemId = inserted.id;
  }

  const projectId = await resolveProjectId(supabase, subject);
  const storagePath = `${projectId}/${audioItemId}/${randomUUID()}-${sanitizeFilename(originalFilename)}`;

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError) throw signedError;

  return { audioItemId, storagePath, signedUrl: signed.signedUrl, token: signed.token };
}

export interface FinalizedUpload {
  versionId: string;
  versionNumber: number;
  durationSeconds: number | null;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitRateBps: number | null;
  containerFormat: string | null;
  fileSizeBytes: number;
  waveformPeaks: number[] | null;
}

/** Downloads the just-uploaded bytes, extracts real metadata + a real waveform, and atomically records the new version via the create_audio_version RPC. */
export async function finalizeUpload(
  supabase: Client,
  audioItemId: string,
  storagePath: string,
  originalFilename: string,
): Promise<FinalizedUpload> {
  const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(storagePath);
  if (downloadError) throw downloadError;
  const buffer = Buffer.from(await blob.arrayBuffer());

  const processed = await processUploadedAudio(buffer, originalFilename);

  // The generated RPC arg types claim these are non-nullable, but the SQL
  // function itself has no NOT NULL on its parameters — ffprobe genuinely
  // can't always report every field (e.g. some containers omit bit_rate),
  // and a real null is more honest than a fabricated placeholder value.
  const { data: versionId, error: rpcError } = await supabase.rpc("create_audio_version", {
    p_audio_item_id: audioItemId,
    p_original_filename: originalFilename,
    p_storage_path: storagePath,
    p_file_size_bytes: processed.fileSizeBytes,
    p_file_checksum: processed.fileChecksum,
    p_duration_seconds: processed.durationSeconds as number,
    p_codec: processed.codec as string,
    p_sample_rate_hz: processed.sampleRateHz as number,
    p_channels: processed.channels as number,
    p_bit_rate_bps: processed.bitRateBps as number,
    p_container_format: processed.containerFormat as string,
    p_waveform_peaks: processed.waveformPeaks,
  });
  if (rpcError) throw rpcError;

  const { data: version, error: versionError } = await supabase
    .from("audio_versions")
    .select("version_number")
    .eq("id", versionId)
    .single();
  if (versionError) throw versionError;

  return {
    versionId,
    versionNumber: version.version_number,
    durationSeconds: processed.durationSeconds,
    codec: processed.codec,
    sampleRateHz: processed.sampleRateHz,
    channels: processed.channels,
    bitRateBps: processed.bitRateBps,
    containerFormat: processed.containerFormat,
    fileSizeBytes: processed.fileSizeBytes,
    waveformPeaks: processed.waveformPeaks,
  };
}

export async function restoreAudioVersion(supabase: Client, audioVersionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("restore_audio_version", { p_audio_version_id: audioVersionId });
  if (error) throw error;
  return data;
}

/** Short-lived signed URL for playback — RLS-checked at issuance (SELECT on storage.objects), same as upload. */
export async function getPlaybackUrl(supabase: Client, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
