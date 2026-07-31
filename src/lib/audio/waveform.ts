/**
 * Real waveform peak generation: decodes the actual audio (any format
 * ffmpeg's static build supports — mp3, wav, aac/m4a, flac, ogg, ...) to raw
 * 16-bit mono PCM at a low sample rate via the bundled ffmpeg binary, then
 * reduces that to a fixed number of peak buckets in plain JS. Generated
 * once at upload time and stored on audio_versions.waveform_peaks — never
 * regenerated (see docs/audio-foundation.md).
 */
import { spawn } from "node:child_process";
import { getFfmpegPath } from "./ffmpeg-paths";

const DECODE_SAMPLE_RATE_HZ = 8000;
export const DEFAULT_BUCKET_COUNT = 200;

/** Decodes filePath to raw mono 16-bit PCM via ffmpeg, returned as a single Buffer. */
function decodeToPcm(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-i",
      filePath,
      "-f",
      "s16le",
      "-ac",
      "1",
      "-ar",
      String(DECODE_SAMPLE_RATE_HZ),
      "pipe:1",
    ];
    const child = spawn(getFfmpegPath(), args);
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderrChunks).toString("utf8")}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

/** Reduces a 16-bit PCM buffer to `bucketCount` peak values in [0, 1], one per bucket, by taking the max absolute sample amplitude in each bucket. */
function pcmToPeaks(pcm: Buffer, bucketCount: number): number[] {
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount === 0) return new Array(bucketCount).fill(0);

  const samplesPerBucket = Math.max(1, Math.floor(sampleCount / bucketCount));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerBucket;
    const end = bucket === bucketCount - 1 ? sampleCount : start + samplesPerBucket;
    let peak = 0;
    for (let i = start; i < end && i < sampleCount; i++) {
      const sample = Math.abs(pcm.readInt16LE(i * 2));
      if (sample > peak) peak = sample;
    }
    peaks.push(peak / 32768);
  }

  return peaks;
}

export async function generateWaveformPeaks(
  filePath: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): Promise<number[]> {
  const pcm = await decodeToPcm(filePath);
  return pcmToPeaks(pcm, bucketCount);
}
