// Phase 2C.1 — seeds a handful of REAL audio recordings against the real
// seeded Standard Radio and PRAMS subjects, using the actual upload
// pipeline (real Storage objects, real ffprobe/ffmpeg metadata + waveform
// extraction) rather than fabricated rows — "no mock data" applies to
// audio itself, not just the schema.
//
// This is NOT part of `supabase db reset` — unlike every other table,
// audio needs real bytes sitting in Supabase Storage, which a pure-SQL
// seed.sql cannot create (SQL can insert an audio_versions row, but not the
// backing object storage-api actually serves). Run this once after every
// `supabase db reset`:
//
//   node --env-file=.env.local supabase/seed-audio.mjs
//
// See docs/audio-foundation.md's Known Limitations for why this is a
// separate, documented step instead of folded into the single-command reset.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { processUploadedAudio } from "../src/lib/audio/process-upload.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Run with: node --env-file=.env.local supabase/seed-audio.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const BUCKET = "audio-recordings";
const FIXTURES_DIR = new URL("./tests/fixtures/audio/", import.meta.url);

const PRIYA_USER_ID = "00000000-0000-0000-0000-000000000301"; // ima_admin — user_profiles.id

async function uploadOne({ audioItemColumn, subjectId, fileName, projectId }) {
  let { data: item } = await supabase.from("audio_items").select("id").eq(audioItemColumn, subjectId).maybeSingle();
  if (!item) {
    const { data: inserted, error } = await supabase
      .from("audio_items")
      .insert({ [audioItemColumn]: subjectId })
      .select("id")
      .single();
    if (error) throw error;
    item = inserted;
  }

  const buffer = await readFile(new URL(fileName, FIXTURES_DIR));
  const storagePath = `${projectId}/${item.id}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: fileName.endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
  });
  if (uploadError) throw uploadError;

  const processed = await processUploadedAudio(buffer, fileName);

  const { data: versionId, error: rpcError } = await supabase.rpc("create_audio_version", {
    p_audio_item_id: item.id,
    p_original_filename: fileName,
    p_storage_path: storagePath,
    p_file_size_bytes: processed.fileSizeBytes,
    p_file_checksum: processed.fileChecksum,
    p_duration_seconds: processed.durationSeconds,
    p_codec: processed.codec,
    p_sample_rate_hz: processed.sampleRateHz,
    p_channels: processed.channels,
    p_bit_rate_bps: processed.bitRateBps,
    p_container_format: processed.containerFormat,
    p_waveform_peaks: processed.waveformPeaks,
  });
  if (rpcError) throw rpcError;

  // Service-role has no auth.uid(), so the RPC logged uploaded_by_user_id
  // as null — backfill it to a real seeded producer for a realistic demo.
  await supabase.from("audio_versions").update({ uploaded_by_user_id: PRIYA_USER_ID }).eq("id", versionId);

  console.log(`  ${fileName} -> audio_item ${item.id}, version ${versionId} (${processed.durationSeconds}s, ${processed.codec})`);
}

console.log("Seeding real audio recordings...");

const { data: manTfs } = await supabase.from("script_variants").select("id").eq("variant_code", "MAN-TFS").single();
await uploadOne({
  audioItemColumn: "script_variant_id",
  subjectId: manTfs.id,
  fileName: "tone-440hz-3s.wav",
  projectId: "00000000-0000-0000-0000-000000000501",
});

const { data: bhxFao } = await supabase.from("script_variants").select("id").eq("variant_code", "BHX-FAO").single();
await uploadOne({
  audioItemColumn: "script_variant_id",
  subjectId: bhxFao.id,
  fileName: "tone-fade-4s.wav",
  projectId: "00000000-0000-0000-0000-000000000501",
});

const { data: boarding080 } = await supabase
  .from("prams_announcement_versions")
  .select("id, project_id, announcement:prams_announcements!inner(reference_code)")
  .eq("project_id", "00000000-0000-0000-0000-000000000504")
  .eq("announcement.reference_code", "080.J2")
  .single();
await uploadOne({
  audioItemColumn: "announcement_version_id",
  subjectId: boarding080.id,
  fileName: "tone-880hz-2s.mp3",
  projectId: boarding080.project_id,
});

console.log("Done.");
