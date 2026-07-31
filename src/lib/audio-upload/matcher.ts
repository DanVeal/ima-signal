/**
 * The filename matching engine: proposes, for each uploaded file, which
 * Standard Radio script_variant or PRAMS announcement_version it belongs
 * to. Pure function — no I/O, no database access — so it's trivially
 * unit-testable and reusable for both a single upload and a 150+-file bulk
 * upload. Never commits anything itself: the caller always shows this as a
 * preview the user must approve (see docs/audio-foundation.md).
 */

export interface MatchTarget {
  /** audio_items subject id — a script_variants.id or a prams_announcement_versions.id. */
  subjectId: string;
  subjectType: "script_variant" | "announcement_version";
  /** The code to match against (variant_code, or the announcement's reference_code). */
  code: string;
  /** Human label for display (e.g. "MAN-TFS — Manchester → Tenerife", "080A.J2 — BOARDING – VIP"). */
  label: string;
  /** The checksum of the target's current audio version, if it has one — for duplicate detection. */
  currentChecksum: string | null;
}

export interface UploadCandidate {
  fileName: string;
  fileSizeBytes: number;
  /** SHA-256 of the file's bytes — required for duplicate detection; compute client-side (Web Crypto) before matching. */
  checksum: string;
}

export type MatchTier = "exact" | "case_insensitive" | "whitespace_insensitive" | "reference_code" | "none";

export type MatchStatus = "matched" | "unmatched" | "ambiguous" | "unknown_reference";

export interface MatchResult {
  fileName: string;
  fileSizeBytes: number;
  checksum: string;
  status: MatchStatus;
  tier: MatchTier;
  /** Populated when status is "matched" (exactly one best candidate) or as the top candidate for "ambiguous". */
  target: MatchTarget | null;
  /** All candidates found at the winning tier — length > 1 means "ambiguous". */
  candidates: MatchTarget[];
  /** True if this file's checksum matches the CURRENT version's checksum of its matched target (or any target, if unmatched). */
  isDuplicate: boolean;
  /** True if another file earlier in this same batch already has this checksum. */
  isDuplicateInBatch: boolean;
  warnings: string[];
}

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function removeWhitespace(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * A reference-code-shaped token, generic enough for both PRAMS ("080A.J2")
 * and Standard Radio ("MAN-TFS") style codes. No word-boundary anchors —
 * filenames commonly separate a code from the rest with "_" or "-", which
 * `\b` doesn't treat as a boundary (both are word characters), so anchoring
 * on it would miss "099Z.J2_extra.wav". Deliberately case-SENSITIVE (no
 * `/i`): every real code in this system is written in caps in a filename
 * ("MAN-TFS", "080A.J2"), and ordinary hyphenated English words ("totally-
 * unrelated-file") are lowercase, so requiring caps is what keeps this from
 * flagging plain filenames as "looks like a reference".
 */
const CODE_SHAPED_TOKEN = /[A-Z0-9]{2,6}(?:[.\-][A-Z0-9]{1,6}){1,3}/;

function findExact(stem: string, targets: MatchTarget[]): MatchTarget[] {
  return targets.filter((t) => t.code === stem);
}

function findCaseInsensitive(stem: string, targets: MatchTarget[]): MatchTarget[] {
  const lower = stem.toLowerCase();
  return targets.filter((t) => t.code.toLowerCase() === lower);
}

function findWhitespaceInsensitive(stem: string, targets: MatchTarget[]): MatchTarget[] {
  const normalized = removeWhitespace(stem).toLowerCase();
  return targets.filter((t) => removeWhitespace(t.code).toLowerCase() === normalized);
}

/** Filename CONTAINS a target's code as a substring — e.g. "Boarding_080A.J2_v2_FINAL.wav" contains "080A.J2". Prefers the longest (most specific) code among ties. */
function findByReferenceCode(stem: string, targets: MatchTarget[]): MatchTarget[] {
  const haystack = removeWhitespace(stem).toLowerCase();
  const matches = targets.filter((t) => haystack.includes(removeWhitespace(t.code).toLowerCase()));
  if (matches.length <= 1) return matches;
  const maxLength = Math.max(...matches.map((t) => t.code.length));
  return matches.filter((t) => t.code.length === maxLength);
}

export function matchFile(candidate: UploadCandidate, targets: MatchTarget[]): Omit<MatchResult, "isDuplicateInBatch"> {
  const stem = stripExtension(candidate.fileName);
  const warnings: string[] = [];

  const tiers: [MatchTier, () => MatchTarget[]][] = [
    ["exact", () => findExact(stem, targets)],
    ["case_insensitive", () => findCaseInsensitive(stem, targets)],
    ["whitespace_insensitive", () => findWhitespaceInsensitive(stem, targets)],
    ["reference_code", () => findByReferenceCode(stem, targets)],
  ];

  for (const [tier, find] of tiers) {
    const found = find();
    if (found.length === 1) {
      const target = found[0];
      const isDuplicate = target.currentChecksum !== null && target.currentChecksum === candidate.checksum;
      if (isDuplicate) warnings.push(`Identical to the current recording for ${target.label}`);
      return {
        fileName: candidate.fileName,
        fileSizeBytes: candidate.fileSizeBytes,
        checksum: candidate.checksum,
        status: "matched",
        tier,
        target,
        candidates: found,
        isDuplicate,
        warnings,
      };
    }
    if (found.length > 1) {
      warnings.push(`Ambiguous: matches ${found.length} candidates (${found.map((t) => t.code).join(", ")})`);
      return {
        fileName: candidate.fileName,
        fileSizeBytes: candidate.fileSizeBytes,
        checksum: candidate.checksum,
        status: "ambiguous",
        tier,
        target: found[0],
        candidates: found,
        isDuplicate: false,
        warnings,
      };
    }
  }

  const looksLikeACode = CODE_SHAPED_TOKEN.test(stem);
  return {
    fileName: candidate.fileName,
    fileSizeBytes: candidate.fileSizeBytes,
    checksum: candidate.checksum,
    status: looksLikeACode ? "unknown_reference" : "unmatched",
    tier: "none",
    target: null,
    candidates: [],
    isDuplicate: false,
    warnings: looksLikeACode
      ? [`Filename looks like it references a code, but nothing in this project matches`]
      : [],
  };
}

export function matchFiles(candidates: UploadCandidate[], targets: MatchTarget[]): MatchResult[] {
  const seenChecksums = new Set<string>();
  const results: MatchResult[] = [];

  for (const candidate of candidates) {
    const result = matchFile(candidate, targets);
    const isDuplicateInBatch = seenChecksums.has(candidate.checksum);
    seenChecksums.add(candidate.checksum);

    const warnings = [...result.warnings];
    if (isDuplicateInBatch) warnings.push("Identical to another file already in this batch");

    results.push({ ...result, isDuplicateInBatch, warnings });
  }

  // Flag same-target collisions within the batch — informational, doesn't change status.
  const byTarget = new Map<string, MatchResult[]>();
  for (const r of results) {
    if (r.status !== "matched" || !r.target) continue;
    const list = byTarget.get(r.target.subjectId) ?? [];
    list.push(r);
    byTarget.set(r.target.subjectId, list);
  }
  for (const list of byTarget.values()) {
    if (list.length > 1) {
      for (const r of list) {
        r.warnings.push(`${list.length} files in this batch matched to the same target (${r.target?.label})`);
      }
    }
  }

  return results;
}

export interface MatchSummary {
  matched: number;
  unmatched: number;
  ambiguous: number;
  unknownReference: number;
  duplicates: number;
  warnings: number;
  readyToImport: number;
}

export function summarizeMatches(results: MatchResult[]): MatchSummary {
  const matched = results.filter((r) => r.status === "matched").length;
  const unmatched = results.filter((r) => r.status === "unmatched").length;
  const ambiguous = results.filter((r) => r.status === "ambiguous").length;
  const unknownReference = results.filter((r) => r.status === "unknown_reference").length;
  const duplicates = results.filter((r) => r.isDuplicate || r.isDuplicateInBatch).length;
  const warnings = results.filter((r) => r.warnings.length > 0).length;
  // Ready to import: matched, not a duplicate of the current version (a
  // legitimate replace still counts — only an EXACT duplicate is excluded),
  // and not part of a same-target collision (those need a manual pick).
  const readyToImport = results.filter(
    (r) => r.status === "matched" && !r.isDuplicate && !r.isDuplicateInBatch,
  ).length;

  return { matched, unmatched, ambiguous, unknownReference, duplicates, warnings, readyToImport };
}
