// Phase 2C.1 — metadata extraction + waveform generation tests, against
// real audio fixtures (no mocked ffprobe/ffmpeg output). Run via tsx:
//   node --import tsx supabase/tests/audio-metadata-waveform.test.mjs
import { readFile } from "node:fs/promises";
import { extractAudioMetadata } from "@/lib/audio/metadata";
import { generateWaveformPeaks, DEFAULT_BUCKET_COUNT } from "@/lib/audio/waveform";
import { processUploadedAudio } from "@/lib/audio/process-upload";
import { sha256 } from "@/lib/audio/checksum";
import { check, summarize } from "./helpers.mjs";

const FIXTURES = new URL("./fixtures/audio/", import.meta.url);

async function fixturePath(name) {
  // extractAudioMetadata/generateWaveformPeaks take a file path, not a buffer.
  return new URL(name, FIXTURES).pathname;
}

console.log("\n=== Metadata extraction: real WAV fixture ===");
{
  const path = await fixturePath("tone-440hz-3s.wav");
  const meta = await extractAudioMetadata(path);
  check("duration is real (~3s), not fabricated", meta.durationSeconds !== null && Math.abs(meta.durationSeconds - 3) < 0.05);
  check("codec correctly identified as pcm_s16le", meta.codec === "pcm_s16le");
  check("sample rate correctly identified as 44100Hz", meta.sampleRateHz === 44100);
  check("channels correctly identified as stereo (2)", meta.channels === 2);
  check("container format correctly identified as wav", meta.containerFormat === "wav");
  check("bit rate is a real positive number", typeof meta.bitRateBps === "number" && meta.bitRateBps > 0);
}

console.log("\n=== Metadata extraction: real MP3 fixture ===");
{
  const path = await fixturePath("tone-880hz-2s.mp3");
  const meta = await extractAudioMetadata(path);
  check("duration is real (~2s)", meta.durationSeconds !== null && Math.abs(meta.durationSeconds - 2) < 0.1);
  check("codec correctly identified as mp3", meta.codec === "mp3");
  check("container format correctly identified as mp3", meta.containerFormat === "mp3");
  check("bit rate reflects the encoded rate (~128kbps)", meta.bitRateBps !== null && Math.abs(meta.bitRateBps - 128000) < 5000);
}

console.log("\n=== Metadata extraction: rejects a non-audio file ===");
{
  const notAudioPath = await fixturePath("../onboard-prams-grid-july-26.xlsx");
  let threw = false;
  try {
    await extractAudioMetadata(notAudioPath);
  } catch {
    threw = true;
  }
  check("extractAudioMetadata throws for a file with no audio stream", threw);
}

console.log("\n=== Waveform generation ===");
{
  const path = await fixturePath("tone-440hz-3s.wav");
  const peaks = await generateWaveformPeaks(path);
  check(`generates exactly ${DEFAULT_BUCKET_COUNT} peak buckets by default`, peaks.length === DEFAULT_BUCKET_COUNT);
  check("every peak is in [0, 1]", peaks.every((p) => p >= 0 && p <= 1));
  check("a constant-amplitude tone produces a genuinely non-zero waveform", peaks.some((p) => p > 0.01));

  const customCount = await generateWaveformPeaks(path, 50);
  check("bucket count is configurable", customCount.length === 50);
}

console.log("\n=== Waveform generation reflects a REAL envelope, not a flat/fake shape ===");
{
  const path = await fixturePath("tone-fade-4s.wav");
  const peaks = await generateWaveformPeaks(path);
  const firstTenth = peaks.slice(0, Math.floor(peaks.length / 10));
  const middleTenth = peaks.slice(Math.floor(peaks.length * 0.45), Math.floor(peaks.length * 0.55));
  const avgFirst = firstTenth.reduce((a, b) => a + b, 0) / firstTenth.length;
  const avgMiddle = middleTenth.reduce((a, b) => a + b, 0) / middleTenth.length;
  check(
    "a fade-in fixture's opening peaks are quieter than its sustained middle (real envelope, not fabricated)",
    avgFirst < avgMiddle,
  );
}

console.log("\n=== Checksum ===");
{
  const bufferA = await readFile(await fixturePath("tone-440hz-3s.wav"));
  const bufferB = await readFile(await fixturePath("tone-440hz-3s.wav"));
  const bufferC = await readFile(await fixturePath("tone-880hz-2s.mp3"));
  check("the same file hashes identically", sha256(bufferA) === sha256(bufferB));
  check("different files hash differently", sha256(bufferA) !== sha256(bufferC));
}

console.log("\n=== End-to-end: processUploadedAudio combines all three ===");
{
  const buffer = await readFile(await fixturePath("tone-fade-4s.wav"));
  const result = await processUploadedAudio(buffer, "tone-fade-4s.wav");
  check("processUploadedAudio returns real duration", Math.abs((result.durationSeconds ?? 0) - 4) < 0.05);
  check("processUploadedAudio returns real file size matching the buffer", result.fileSizeBytes === buffer.byteLength);
  check("processUploadedAudio returns a real checksum matching a direct hash", result.fileChecksum === sha256(buffer));
  check("processUploadedAudio returns real waveform peaks", result.waveformPeaks.length === DEFAULT_BUCKET_COUNT);
}

summarize();
