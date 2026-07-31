/**
 * Pure text-normalization helpers shared by the comparison and
 * pronunciation modules. No I/O, no database — same "pure functions"
 * discipline as src/lib/audio-upload/matcher.ts.
 */

/** Lowercases and strips leading/trailing punctuation, keeping internal apostrophes (don't, jet2's). */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** True for a word shaped like a proper noun in running English prose — capitalized, not the sentence's first word (callers pass isSentenceStart), and not a common capitalized function word. */
const COMMON_CAPITALIZED_WORDS = new Set([
  "i",
  "the",
  "a",
  "an",
  "from",
  "to",
  "with",
  "and",
  "or",
  "in",
  "on",
  "at",
  "for",
  "of",
  "terms",
  "prices",
  "based",
]);

export function looksLikeProperNoun(word: string, isSentenceStart: boolean): boolean {
  const stripped = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (stripped.length < 2) return false;
  if (!/^[A-Z]/.test(stripped)) return false;
  if (isSentenceStart && COMMON_CAPITALIZED_WORDS.has(stripped.toLowerCase())) return false;
  return true;
}

/** Classic iterative Levenshtein edit distance — small alphabets/lengths here (single words), so O(n*m) is fine. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(Math.min(prevRow[j] + 1, currentRow[j - 1] + 1, prevRow[j - 1] + cost));
    }
    prevRow = currentRow;
  }
  return prevRow[b.length];
}

/** How similar two normalized words are, in [0, 1] — 1 is identical, 0 is completely different. */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
