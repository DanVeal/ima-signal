/**
 * The comparison engine: aligns an approved script revision's wording
 * against a transcript's words and classifies every difference. Pure
 * functions, no I/O, no database — directly unit-testable, same
 * discipline as audio-upload/matcher.ts.
 *
 * "Do not rely on string equality. Use semantic alignment while
 * preserving exact differences" is implemented as a Levenshtein-weighted
 * sequence alignment (a Needleman-Wunsch variant): two words align as a
 * match/substitution pair whenever they're similar enough, rather than
 * only when byte-identical, so a single misheard word doesn't cascade
 * into "everything after this point looks different." Every aligned pair
 * still carries its own exact script text and exact transcript text, so
 * nothing is lossy.
 */
import { looksLikeProperNoun, normalizeWord, splitWords, wordSimilarity } from "./text";

export type DiffClassification =
  | "perfect"
  | "minor_wording"
  | "major_wording"
  | "missing_phrase"
  | "additional_phrase"
  | "possible_pronunciation"
  | "timing_issue"
  | "confidence_issue";

export interface ScriptLineInput {
  sortOrder: number;
  text: string | null;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

export interface TranscriptSegmentInput {
  sortOrder: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  wordTimings?: WordTiming[] | null;
}

export interface ComparisonFinding {
  sortOrder: number;
  classification: DiffClassification;
  scriptLineSortOrder: number | null;
  scriptText: string | null;
  transcriptSegmentSortOrder: number | null;
  transcriptText: string | null;
  startMs: number | null;
  endMs: number | null;
  confidence: number | null;
}

export interface PronunciationCandidate {
  comparisonFindingIndex: number;
  transcriptSegmentSortOrder: number | null;
  word: string;
  confidence: number | null;
  startMs: number | null;
  endMs: number | null;
}

export interface ComparisonOutcome {
  matchRatio: number;
  findings: ComparisonFinding[];
  pronunciationCandidates: PronunciationCandidate[];
}

// Similarity thresholds — deliberately generous (a single-character typo/
// misheard sound shouldn't read as "completely different"), tuned by the
// unit tests in supabase/tests/intelligence-engine.test.mjs's diff-accuracy
// section rather than a formula derived from anywhere authoritative.
const FUZZY_MATCH_THRESHOLD = 0.5;
const MINOR_WORDING_THRESHOLD = 0.75;
const CONFIDENCE_ISSUE_THRESHOLD = 0.5;
const PRONUNCIATION_CONFIDENCE_THRESHOLD = 0.78;
const PRONUNCIATION_SIMILARITY_THRESHOLD = 0.6;

interface ScriptWordToken {
  text: string;
  normalized: string;
  lineSortOrder: number;
  isSentenceStart: boolean;
}

interface TranscriptWordToken {
  text: string;
  normalized: string;
  segmentSortOrder: number;
  startMs: number;
  endMs: number;
  confidence: number | null;
}

function tokenizeScript(lines: ScriptLineInput[]): ScriptWordToken[] {
  const tokens: ScriptWordToken[] = [];
  for (const line of lines) {
    if (!line.text) continue;
    const words = splitWords(line.text);
    words.forEach((word, i) => {
      tokens.push({
        text: word,
        normalized: normalizeWord(word),
        lineSortOrder: line.sortOrder,
        isSentenceStart: i === 0,
      });
    });
  }
  return tokens.filter((t) => t.normalized.length > 0);
}

function tokenizeTranscript(segments: TranscriptSegmentInput[]): TranscriptWordToken[] {
  const tokens: TranscriptWordToken[] = [];
  for (const segment of segments) {
    if (segment.wordTimings && segment.wordTimings.length > 0) {
      for (const wt of segment.wordTimings) {
        const normalized = normalizeWord(wt.word);
        if (!normalized) continue;
        tokens.push({
          text: wt.word,
          normalized,
          segmentSortOrder: segment.sortOrder,
          startMs: wt.startMs,
          endMs: wt.endMs,
          confidence: wt.confidence,
        });
      }
      continue;
    }
    // No word-level timing from the provider — split the segment's text
    // evenly across its duration so every word still gets a usable,
    // approximate timecode for jump-to-audio.
    const words = splitWords(segment.text).filter((w) => normalizeWord(w).length > 0);
    if (words.length === 0) continue;
    const span = Math.max(segment.endMs - segment.startMs, 1);
    const perWord = span / words.length;
    words.forEach((word, i) => {
      tokens.push({
        text: word,
        normalized: normalizeWord(word),
        segmentSortOrder: segment.sortOrder,
        startMs: Math.round(segment.startMs + i * perWord),
        endMs: Math.round(segment.startMs + (i + 1) * perWord),
        confidence: segment.confidence,
      });
    });
  }
  return tokens;
}

type AlignOp =
  | { kind: "match" | "substitute"; script: ScriptWordToken; transcript: TranscriptWordToken; similarity: number }
  | { kind: "delete"; script: ScriptWordToken }
  | { kind: "insert"; transcript: TranscriptWordToken };

function substitutionCost(a: ScriptWordToken, b: TranscriptWordToken): number {
  if (a.normalized === b.normalized) return 0;
  const similarity = wordSimilarity(a.normalized, b.normalized);
  if (similarity >= FUZZY_MATCH_THRESHOLD) return 2 * (1 - similarity);
  return 2; // as costly as a delete+insert pair — let the DP choose either path freely
}

/** Needleman-Wunsch global alignment, weighted by word similarity rather than pure equality. */
function align(scriptWords: ScriptWordToken[], transcriptWords: TranscriptWordToken[]): AlignOp[] {
  const n = scriptWords.length;
  const m = transcriptWords.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i;
  for (let j = 1; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const subCost = substitutionCost(scriptWords[i - 1], transcriptWords[j - 1]);
      dp[i][j] = Math.min(dp[i - 1][j - 1] + subCost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + substitutionCost(scriptWords[i - 1], transcriptWords[j - 1])) {
      const script = scriptWords[i - 1];
      const transcript = transcriptWords[j - 1];
      const similarity = wordSimilarity(script.normalized, transcript.normalized);
      ops.push({ kind: similarity === 1 ? "match" : "substitute", script, transcript, similarity });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ kind: "delete", script: scriptWords[i - 1] });
      i -= 1;
    } else {
      ops.push({ kind: "insert", transcript: transcriptWords[j - 1] });
      j -= 1;
    }
  }
  return ops.reverse();
}

function classifyOp(op: AlignOp): { classification: DiffClassification; isPronunciationCandidate: boolean } {
  if (op.kind === "delete") return { classification: "missing_phrase", isPronunciationCandidate: false };
  if (op.kind === "insert") return { classification: "additional_phrase", isPronunciationCandidate: false };

  const confidence = op.transcript.confidence;
  const isProperNoun = looksLikeProperNoun(op.script.text, op.script.isSentenceStart);

  if (confidence != null && confidence < CONFIDENCE_ISSUE_THRESHOLD) {
    return { classification: "confidence_issue", isPronunciationCandidate: isProperNoun };
  }

  if (op.kind === "match") {
    if (isProperNoun && confidence != null && confidence < PRONUNCIATION_CONFIDENCE_THRESHOLD) {
      return { classification: "possible_pronunciation", isPronunciationCandidate: true };
    }
    return { classification: "perfect", isPronunciationCandidate: false };
  }

  // substitute
  if (isProperNoun && op.similarity >= PRONUNCIATION_SIMILARITY_THRESHOLD) {
    return { classification: "possible_pronunciation", isPronunciationCandidate: true };
  }
  if (op.similarity >= MINOR_WORDING_THRESHOLD) {
    return { classification: "minor_wording", isPronunciationCandidate: false };
  }
  return { classification: "major_wording", isPronunciationCandidate: false };
}

/**
 * Compares an approved script revision's lines against a transcript's
 * segments. Returns phrase-level findings (consecutive same-classification
 * words merged into one finding) plus flagged pronunciation candidates —
 * never an assertion, only a flag (see docs/intelligence-engine.md).
 */
export function compareScriptToTranscript(
  scriptLines: ScriptLineInput[],
  transcriptSegments: TranscriptSegmentInput[],
): ComparisonOutcome {
  const scriptWords = tokenizeScript(scriptLines);
  const transcriptWords = tokenizeTranscript(transcriptSegments);
  const ops = align(scriptWords, transcriptWords);

  const findings: ComparisonFinding[] = [];
  const pronunciationCandidates: PronunciationCandidate[] = [];
  let matchedScriptWordCount = 0;

  let current: {
    classification: DiffClassification;
    scriptLineSortOrder: number | null;
    scriptWords: string[];
    transcriptSegmentSortOrder: number | null;
    transcriptWords: string[];
    startMs: number | null;
    endMs: number | null;
    confidences: number[];
    pronunciationWords: { word: string; confidence: number | null; startMs: number | null; endMs: number | null; segmentSortOrder: number | null }[];
  } | null = null;

  function flush() {
    if (!current) return;
    const finding: ComparisonFinding = {
      sortOrder: findings.length,
      classification: current.classification,
      scriptLineSortOrder: current.scriptLineSortOrder,
      scriptText: current.scriptWords.length > 0 ? current.scriptWords.join(" ") : null,
      transcriptSegmentSortOrder: current.transcriptSegmentSortOrder,
      transcriptText: current.transcriptWords.length > 0 ? current.transcriptWords.join(" ") : null,
      startMs: current.startMs,
      endMs: current.endMs,
      confidence: current.confidences.length > 0 ? Math.min(...current.confidences) : null,
    };
    findings.push(finding);
    for (const pw of current.pronunciationWords) {
      pronunciationCandidates.push({
        comparisonFindingIndex: finding.sortOrder,
        transcriptSegmentSortOrder: pw.segmentSortOrder,
        word: pw.word,
        confidence: pw.confidence,
        startMs: pw.startMs,
        endMs: pw.endMs,
      });
    }
    current = null;
  }

  for (const op of ops) {
    const { classification, isPronunciationCandidate } = classifyOp(op);
    const scriptLineSortOrder = op.kind === "delete" || op.kind === "match" || op.kind === "substitute" ? op.script.lineSortOrder : null;
    const transcriptSegmentSortOrder = op.kind === "insert" || op.kind === "match" || op.kind === "substitute" ? op.transcript.segmentSortOrder : null;
    const startMs = op.kind === "insert" || op.kind === "match" || op.kind === "substitute" ? op.transcript.startMs : null;
    const endMs = op.kind === "insert" || op.kind === "match" || op.kind === "substitute" ? op.transcript.endMs : null;
    const confidence = op.kind === "insert" || op.kind === "match" || op.kind === "substitute" ? op.transcript.confidence : null;

    if (op.kind === "match" || op.kind === "substitute") matchedScriptWordCount += 1;

    const sameGroup =
      current &&
      current.classification === classification &&
      (scriptLineSortOrder === null || current.scriptLineSortOrder === null || current.scriptLineSortOrder === scriptLineSortOrder);

    if (!sameGroup) {
      flush();
      current = {
        classification,
        scriptLineSortOrder,
        scriptWords: [],
        transcriptSegmentSortOrder,
        transcriptWords: [],
        startMs,
        endMs,
        confidences: [],
        pronunciationWords: [],
      };
    }

    if (current!.scriptLineSortOrder === null) current!.scriptLineSortOrder = scriptLineSortOrder;
    if (current!.transcriptSegmentSortOrder === null) current!.transcriptSegmentSortOrder = transcriptSegmentSortOrder;
    if (op.kind === "delete" || op.kind === "match" || op.kind === "substitute") current!.scriptWords.push(op.script.text);
    if (op.kind === "insert" || op.kind === "match" || op.kind === "substitute") current!.transcriptWords.push(op.transcript.text);
    if (startMs != null) current!.startMs = current!.startMs == null ? startMs : Math.min(current!.startMs, startMs);
    if (endMs != null) current!.endMs = current!.endMs == null ? endMs : Math.max(current!.endMs, endMs);
    if (confidence != null) current!.confidences.push(confidence);
    if (isPronunciationCandidate && (op.kind === "match" || op.kind === "substitute")) {
      current!.pronunciationWords.push({
        word: op.script.text,
        confidence: op.transcript.confidence,
        startMs: op.transcript.startMs,
        endMs: op.transcript.endMs,
        segmentSortOrder: op.transcript.segmentSortOrder,
      });
    }
  }
  flush();

  appendTimingFindings(findings, scriptWords, transcriptWords, ops);

  const matchRatio = scriptWords.length === 0 ? 1 : matchedScriptWordCount / scriptWords.length;
  return { matchRatio, findings, pronunciationCandidates };
}

const TIMING_MIN_WORDS_PER_LINE = 3;
const TIMING_DEVIATION_RATIO = 2;

/** A lightweight, separate pass: flags a script line whose spoken pace deviates sharply from the recording's own average — appended as additional findings, never replacing the wording classification above. */
function appendTimingFindings(
  findings: ComparisonFinding[],
  scriptWords: ScriptWordToken[],
  transcriptWords: TranscriptWordToken[],
  ops: AlignOp[],
): void {
  if (transcriptWords.length < TIMING_MIN_WORDS_PER_LINE) return;
  const totalSpanMs = transcriptWords[transcriptWords.length - 1].endMs - transcriptWords[0].startMs;
  if (totalSpanMs <= 0) return;
  const overallMsPerWord = totalSpanMs / transcriptWords.length;

  const byLine = new Map<number, { startMs: number; endMs: number; wordCount: number }>();
  for (const op of ops) {
    if (op.kind !== "match" && op.kind !== "substitute") continue;
    const line = byLine.get(op.script.lineSortOrder) ?? { startMs: op.transcript.startMs, endMs: op.transcript.endMs, wordCount: 0 };
    line.startMs = Math.min(line.startMs, op.transcript.startMs);
    line.endMs = Math.max(line.endMs, op.transcript.endMs);
    line.wordCount += 1;
    byLine.set(op.script.lineSortOrder, line);
  }

  let sortOrder = findings.length;
  for (const [lineSortOrder, line] of byLine) {
    if (line.wordCount < TIMING_MIN_WORDS_PER_LINE) continue;
    const lineMsPerWord = (line.endMs - line.startMs) / line.wordCount;
    const ratio = lineMsPerWord / overallMsPerWord;
    if (ratio > TIMING_DEVIATION_RATIO || ratio < 1 / TIMING_DEVIATION_RATIO) {
      findings.push({
        sortOrder: sortOrder++,
        classification: "timing_issue",
        scriptLineSortOrder: lineSortOrder,
        scriptText: null,
        transcriptSegmentSortOrder: null,
        transcriptText: null,
        startMs: line.startMs,
        endMs: line.endMs,
        confidence: null,
      });
    }
  }
}
