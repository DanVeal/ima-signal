/**
 * Resolves the ffmpeg/ffprobe binaries bundled by ffmpeg-static/ffprobe-static
 * (static, statically-linked builds — no system ffmpeg install required).
 * Both packages fall back to `null`/an unresolved path on an unsupported
 * platform; fail loudly rather than let a spawn() call fail with a cryptic
 * ENOENT deep inside metadata/waveform extraction.
 */
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export function getFfmpegPath(): string {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary for this platform");
  return ffmpegPath;
}

export function getFfprobePath(): string {
  if (!ffprobeStatic.path) throw new Error("ffprobe-static did not resolve a binary for this platform");
  return ffprobeStatic.path;
}
