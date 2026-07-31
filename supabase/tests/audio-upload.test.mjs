// Phase 2C.1 — upload/versioning/restore integration tests, against the
// real local Supabase stack (real Storage objects, real ffprobe/ffmpeg
// processing, real signed URLs) as a real signed-in user. Run via tsx:
//   node --env-file=.env.local --import tsx supabase/tests/audio-upload.test.mjs
import { readFile } from "node:fs/promises";
import { signInAs, serviceClient, check, summarize } from "./helpers.mjs";
import * as service from "@/lib/audio-upload/service";
import { matchFile } from "@/lib/audio-upload/matcher";

const STANDARD_RADIO_PROJECT_ID = "00000000-0000-0000-0000-000000000501";
const FIXTURES = new URL("./fixtures/audio/", import.meta.url);

async function fixtureBuffer(name) {
  return readFile(new URL(name, FIXTURES));
}

async function uploadFile(client, subject, buffer, fileName) {
  const slot = await service.requestUploadSlot(client, subject, fileName);
  const { error: uploadError } = await client.storage
    .from("audio-recordings")
    .upload(slot.storagePath, buffer, { contentType: fileName.endsWith(".mp3") ? "audio/mpeg" : "audio/wav" });
  if (uploadError) throw uploadError;
  const finalized = await service.finalizeUpload(client, slot.audioItemId, slot.storagePath, fileName);
  return { slot, finalized };
}

const priya = await signInAs("priya.anand@ima.global"); // ima_admin

// A throwaway script + variant under the real Standard Radio project, so
// this test never touches the real seeded Winter Sun variants' audio.
const { data: script } = await priya
  .from("scripts")
  .insert({ project_id: STANDARD_RADIO_PROJECT_ID, title: "Audio Upload Test Script" })
  .select()
  .single();
const { data: variant } = await priya
  .from("script_variants")
  .insert({ script_id: script.id, variant_code: "AUDIO-TEST-01", column_order: 1 })
  .select()
  .single();

console.log("\n=== First upload: a fresh audio_item, version 1 ===");
const bufferV1 = await fixtureBuffer("tone-440hz-3s.wav");
const { slot: slot1, finalized: v1 } = await uploadFile(priya, { scriptVariantId: variant.id }, bufferV1, "take1.wav");
check("first upload creates version 1", v1.versionNumber === 1);
check("first upload's duration is real (~3s)", Math.abs((v1.durationSeconds ?? 0) - 3) < 0.05);
check("first upload's waveform has real peak data", Array.isArray(v1.waveformPeaks) && v1.waveformPeaks.length > 0);

{
  const { data: item } = await serviceClient.from("audio_items").select("current_version_id").eq("id", slot1.audioItemId).single();
  check("audio_items.current_version_id points at version 1", item.current_version_id === v1.versionId);
}

console.log("\n=== Replace: uploading again creates version 2, never overwrites version 1 ===");
const bufferV2 = await fixtureBuffer("tone-fade-4s.wav");
const { finalized: v2 } = await uploadFile(priya, { scriptVariantId: variant.id }, bufferV2, "take2-final.wav");
check("replace creates version 2 (not an update to version 1)", v2.versionNumber === 2);
check("version 2's duration reflects the NEW file (~4s)", Math.abs((v2.durationSeconds ?? 0) - 4) < 0.05);

{
  const { data: versions } = await serviceClient
    .from("audio_versions")
    .select("id, version_number, original_filename")
    .eq("audio_item_id", slot1.audioItemId)
    .order("version_number");
  check("both versions still exist, in order", versions.length === 2 && versions[0].original_filename === "take1.wav");
  const { data: item } = await serviceClient.from("audio_items").select("current_version_id").eq("id", slot1.audioItemId).single();
  check("current_version_id now points at version 2", item.current_version_id === v2.versionId);
}

console.log("\n=== Restore: making version 1 current again creates version 3, deletes nothing ===");
const restoredVersionId = await service.restoreAudioVersion(priya, v1.versionId);
check("restore creates a genuinely NEW version id", restoredVersionId !== v1.versionId && restoredVersionId !== v2.versionId);

{
  const { data: v3 } = await serviceClient
    .from("audio_versions")
    .select("*")
    .eq("id", restoredVersionId)
    .single();
  check("restored version links back via restored_from_version_id", v3.restored_from_version_id === v1.versionId);
  check("restored version reuses version 1's storage_path (same bytes, no re-upload)", v3.storage_path === slot1.storagePath);
  check("restored version reuses version 1's metadata", v3.file_checksum === (await (async () => {
    const { data } = await serviceClient.from("audio_versions").select("file_checksum").eq("id", v1.versionId).single();
    return data.file_checksum;
  })()));

  const { data: allVersions } = await serviceClient
    .from("audio_versions")
    .select("version_number")
    .eq("audio_item_id", slot1.audioItemId);
  check("all 3 versions still exist after restore (nothing deleted)", allVersions.length === 3);

  const { data: item } = await serviceClient.from("audio_items").select("current_version_id").eq("id", slot1.audioItemId).single();
  check("current_version_id now points at the restored (3rd) version", item.current_version_id === restoredVersionId);
}

console.log("\n=== Duplicate detection reflects the REAL current checksum from the database ===");
{
  const targets = await service.getMatchTargetsForProject(priya, STANDARD_RADIO_PROJECT_ID);
  const target = targets.find((t) => t.subjectId === variant.id);
  check("match target's currentChecksum is populated from the real current version", !!target?.currentChecksum);

  const reUpload = matchFile({ fileName: "AUDIO-TEST-01.wav", fileSizeBytes: bufferV1.byteLength, checksum: target.currentChecksum }, [target]);
  check(
    "re-uploading the same bytes as the current version is flagged as a duplicate against REAL data",
    reUpload.status === "matched" && reUpload.isDuplicate,
  );
}

console.log("\n=== Playback: a signed URL actually serves the real bytes ===");
{
  const url = await service.getPlaybackUrl(priya, slot1.storagePath);
  const res = await fetch(url);
  check("signed playback URL returns 200", res.status === 200);
  const bytes = await res.arrayBuffer();
  check("signed playback URL serves the exact original byte length", bytes.byteLength === bufferV1.byteLength);
}

console.log("\n=== Bulk upload: many files to many distinct subjects, concurrency-capped ===");
{
  const BULK_COUNT = 20;
  const bulkVariants = [];
  for (let i = 0; i < BULK_COUNT; i++) {
    const { data } = await priya
      .from("script_variants")
      .insert({ script_id: script.id, variant_code: `AUDIO-BULK-${i}`, column_order: i + 2 })
      .select()
      .single();
    bulkVariants.push(data);
  }

  const bulkBuffer = await fixtureBuffer("tone-880hz-2s.mp3");
  const CONCURRENCY = 5;
  const results = [];
  const start = Date.now();
  for (let i = 0; i < bulkVariants.length; i += CONCURRENCY) {
    const batch = bulkVariants.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((v) => uploadFile(priya, { scriptVariantId: v.id }, bulkBuffer, `bulk-${v.variant_code}.mp3`)),
    );
    results.push(...batchResults);
  }
  const elapsedMs = Date.now() - start;

  check(`all ${BULK_COUNT} concurrency-capped uploads succeeded`, results.length === BULK_COUNT);
  check(
    "every bulk upload got its own version 1 (independent audio_items, no cross-talk)",
    results.every((r) => r.finalized.versionNumber === 1),
  );
  console.log(`  (${BULK_COUNT} files, concurrency ${CONCURRENCY}, in ${elapsedMs}ms — see docs/audio-foundation.md for the 150+ scaling argument)`);
}

// Cleanup: unlike a project (see docs/phase-2b-limitations.md), a script has
// no activity-logging trigger of its own, so deleting it here genuinely
// succeeds and cascades through script_variants -> audio_items ->
// audio_versions — leaving the real seeded Winter Sun script/variants
// untouched and, just as importantly, leaving winterSunW1 with exactly the
// one real script other suites' `.limit(1)` queries expect on a re-run.
// (`authenticated` has no DELETE grant on `scripts` even for ima_admin —
// only service_role does — so this must go through serviceClient.)
await serviceClient.from("scripts").delete().eq("id", script.id);

summarize();
