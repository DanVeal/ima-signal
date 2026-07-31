/**
 * Real ElevenLabs Speech-to-Text integration — no mock transcription
 * output. `ELEVENLABS_API_KEY` is required; without it this throws a
 * clear, honest error rather than fabricating a transcript (see
 * docs/intelligence-engine.md's Known Limitations for why no API key is
 * configured in this development sandbox, and how that surfaces as a
 * real, retryable job failure rather than fake data).
 */
export const ELEVENLABS_PROVIDER = "elevenlabs";
export const ELEVENLABS_MODEL = "scribe_v1";

export class ElevenLabsNotConfiguredError extends Error {
  constructor() {
    super("ELEVENLABS_API_KEY is not configured — cannot generate a transcript.");
    this.name = "ElevenLabsNotConfiguredError";
  }
}

export interface ElevenLabsWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface ElevenLabsTranscriptionResult {
  text: string;
  language: string | null;
  words: ElevenLabsWord[];
}

interface ElevenLabsApiWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  logprob?: number;
  confidence?: number;
}

interface ElevenLabsApiResponse {
  text?: string;
  language_code?: string;
  words?: ElevenLabsApiWord[];
}

/** Calls the real ElevenLabs speech-to-text endpoint. Throws ElevenLabsNotConfiguredError if no API key is set, or a plain Error carrying the provider's own status/body on any other failure. */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<ElevenLabsTranscriptionResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenLabsNotConfiguredError();

  const form = new FormData();
  form.append("model_id", ELEVENLABS_MODEL);
  form.append("timestamps_granularity", "word");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ElevenLabs speech-to-text request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as ElevenLabsApiResponse;
  const words: ElevenLabsWord[] = (data.words ?? [])
    .filter((w) => w.type !== "spacing" && w.text.trim().length > 0)
    .map((w) => ({
      word: w.text,
      startMs: Math.round((w.start ?? 0) * 1000),
      endMs: Math.round((w.end ?? 0) * 1000),
      confidence: typeof w.confidence === "number" ? w.confidence : typeof w.logprob === "number" ? Math.exp(w.logprob) : null,
    }));

  return { text: data.text ?? "", language: data.language_code ?? null, words };
}

export function mimeTypeForContainer(containerFormat: string | null, codec: string | null): string {
  const format = (containerFormat ?? codec ?? "").toLowerCase();
  if (format.includes("mp3")) return "audio/mpeg";
  if (format.includes("wav")) return "audio/wav";
  if (format.includes("m4a") || format.includes("mp4") || format.includes("aac")) return "audio/mp4";
  if (format.includes("ogg")) return "audio/ogg";
  if (format.includes("flac")) return "audio/flac";
  return "application/octet-stream";
}
