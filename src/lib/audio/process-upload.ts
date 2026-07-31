/**
 * Turns raw uploaded bytes into everything create_audio_version needs:
 * real metadata (ffprobe), a real waveform (ffmpeg PCM decode), and a
 * checksum (duplicate detection). ffprobe/ffmpeg need a real file path, so
 * this writes the buffer to a per-call temp file and always cleans it up,
 * success or failure.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256 } from "./checksum";
import { extractAudioMetadata, type AudioMetadata } from "./metadata";
import { DEFAULT_BUCKET_COUNT, generateWaveformPeaks } from "./waveform";

export interface ProcessedUpload extends AudioMetadata {
  fileSizeBytes: number;
  fileChecksum: string;
  waveformPeaks: number[];
}

export async function processUploadedAudio(
  buffer: Buffer,
  originalFilename: string,
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): Promise<ProcessedUpload> {
  const dir = await mkdtemp(path.join(tmpdir(), "ima-signal-audio-"));
  const ext = path.extname(originalFilename) || ".bin";
  const tempPath = path.join(dir, `${randomUUID()}${ext}`);

  try {
    await writeFile(tempPath, buffer);

    const [metadata, waveformPeaks] = await Promise.all([
      extractAudioMetadata(tempPath),
      generateWaveformPeaks(tempPath, bucketCount),
    ]);

    return {
      ...metadata,
      fileSizeBytes: buffer.byteLength,
      fileChecksum: sha256(buffer),
      waveformPeaks,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
