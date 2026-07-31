/**
 * Real audio metadata extraction via the bundled static ffprobe binary
 * (ffprobe-static) — no system ffmpeg/ffprobe install required. Operates
 * on a file path (ffprobe needs a seekable input), so callers write the
 * uploaded bytes to a temp file first — see process-upload.ts.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFfprobePath } from "./ffmpeg-paths";

const execFileAsync = promisify(execFile);

export interface AudioMetadata {
  durationSeconds: number | null;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitRateBps: number | null;
  containerFormat: string | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
  format_name?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

/** Throws if the file isn't decodable audio at all — callers should surface this as an upload error, not silently skip metadata. */
export async function extractAudioMetadata(filePath: string): Promise<AudioMetadata> {
  const { stdout } = await execFileAsync(getFfprobePath(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const parsed: FfprobeOutput = JSON.parse(stdout);
  const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
  if (!audioStream) {
    throw new Error("No audio stream found in file");
  }

  const durationRaw = parsed.format?.duration;
  const bitRateRaw = audioStream.bit_rate ?? parsed.format?.bit_rate;

  return {
    durationSeconds: durationRaw ? Math.round(parseFloat(durationRaw) * 1000) / 1000 : null,
    codec: audioStream.codec_name ?? null,
    sampleRateHz: audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : null,
    channels: audioStream.channels ?? null,
    bitRateBps: bitRateRaw ? parseInt(bitRateRaw, 10) : null,
    containerFormat: parsed.format?.format_name?.split(",")[0] ?? null,
  };
}
