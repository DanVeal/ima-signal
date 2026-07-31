/**
 * Recording Health aggregation — replaces "generic QC" with a summary of
 * real findings across six categories. Pure functions: every input here
 * is data this phase already computed or already had (waveform peaks from
 * Phase 2C.1), nothing fabricated. "Health summarises findings. It never
 * replaces human judgement" — this module never approves or rejects
 * anything, it only rates.
 */
import type { ComparisonFinding } from "./comparison";

export type HealthRating = "excellent" | "good" | "needs_review" | "attention_required";
export type HealthCategory = "transcript_match" | "pronunciation" | "timing" | "noise_detection" | "confidence" | "completeness";

export interface HealthCategoryScore {
  category: HealthCategory;
  rating: HealthRating;
  summary: string;
}

export interface HealthInput {
  matchRatio: number;
  findings: ComparisonFinding[];
  pronunciationFindingCount: number;
  scriptWordCount: number;
  /** Every confidence value available across the transcript's segments/words — used for the Confidence category. */
  confidenceSamples: number[];
  /** audio_versions.waveform_peaks — real data from Phase 2C.1, used for a genuine (not fabricated) Noise Detection signal. */
  waveformPeaks: number[] | null;
}

const RATING_RANK: Record<HealthRating, number> = { attention_required: 0, needs_review: 1, good: 2, excellent: 3 };

function rateByThresholds(value: number, thresholds: { excellent: number; good: number; needsReview: number }): HealthRating {
  if (value >= thresholds.excellent) return "excellent";
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.needsReview) return "needs_review";
  return "attention_required";
}

function scoreTranscriptMatch(matchRatio: number): HealthCategoryScore {
  const rating = rateByThresholds(matchRatio, { excellent: 0.95, good: 0.85, needsReview: 0.6 });
  return {
    category: "transcript_match",
    rating,
    summary: `${Math.round(matchRatio * 100)}% of the script's wording was found in the transcript.`,
  };
}

function scorePronunciation(pronunciationFindingCount: number, scriptWordCount: number): HealthCategoryScore {
  const density = scriptWordCount === 0 ? 0 : pronunciationFindingCount / scriptWordCount;
  const rating: HealthRating = pronunciationFindingCount === 0 ? "excellent" : rateByThresholds(1 - density, { excellent: 1, good: 0.97, needsReview: 0.92 });
  return {
    category: "pronunciation",
    rating,
    summary:
      pronunciationFindingCount === 0
        ? "No likely pronunciation issues flagged."
        : `${pronunciationFindingCount} word${pronunciationFindingCount === 1 ? "" : "s"} flagged as a possible pronunciation issue — worth a listen.`,
  };
}

function scoreTiming(findings: ComparisonFinding[]): HealthCategoryScore {
  const count = findings.filter((f) => f.classification === "timing_issue").length;
  const rating: HealthRating = count === 0 ? "excellent" : count === 1 ? "good" : count === 2 ? "needs_review" : "attention_required";
  return {
    category: "timing",
    rating,
    summary: count === 0 ? "Pacing is consistent throughout." : `${count} section${count === 1 ? "" : "s"} with pacing that deviates from the rest of the recording.`,
  };
}

/** A real (not fabricated) signal from the waveform peaks already extracted in Phase 2C.1 — flags likely clipping (sustained near-1.0 peaks) or likely dead air (sustained near-0 peaks). */
function scoreNoiseDetection(waveformPeaks: number[] | null): HealthCategoryScore {
  if (!waveformPeaks || waveformPeaks.length === 0) {
    return { category: "noise_detection", rating: "good", summary: "No waveform data available to assess." };
  }
  const clippingRatio = waveformPeaks.filter((p) => p >= 0.98).length / waveformPeaks.length;
  const silenceRatio = waveformPeaks.filter((p) => p <= 0.03).length / waveformPeaks.length;

  if (clippingRatio > 0.15) {
    return { category: "noise_detection", rating: "attention_required", summary: "Sustained peak levels suggest possible clipping — worth a listen." };
  }
  if (silenceRatio > 0.4) {
    return { category: "noise_detection", rating: "needs_review", summary: "Long sections of near-silence detected." };
  }
  if (clippingRatio > 0.05 || silenceRatio > 0.25) {
    return { category: "noise_detection", rating: "good", summary: "Waveform levels are mostly consistent, with minor variation." };
  }
  return { category: "noise_detection", rating: "excellent", summary: "Waveform levels look consistent throughout." };
}

function scoreConfidence(confidenceSamples: number[]): HealthCategoryScore {
  if (confidenceSamples.length === 0) {
    return { category: "confidence", rating: "good", summary: "No transcript confidence data available." };
  }
  const avg = confidenceSamples.reduce((sum, c) => sum + c, 0) / confidenceSamples.length;
  const rating = rateByThresholds(avg, { excellent: 0.9, good: 0.75, needsReview: 0.55 });
  return { category: "confidence", rating, summary: `Average transcription confidence: ${Math.round(avg * 100)}%.` };
}

function scoreCompleteness(findings: ComparisonFinding[], scriptWordCount: number): HealthCategoryScore {
  const missingWordCount = findings
    .filter((f) => f.classification === "missing_phrase")
    .reduce((sum, f) => sum + (f.scriptText?.split(/\s+/).filter(Boolean).length ?? 0), 0);
  const completeness = scriptWordCount === 0 ? 1 : 1 - missingWordCount / scriptWordCount;
  const rating = rateByThresholds(completeness, { excellent: 0.97, good: 0.9, needsReview: 0.75 });
  return {
    category: "completeness",
    rating,
    summary:
      missingWordCount === 0
        ? "The full script appears to be present in the recording."
        : `${missingWordCount} script word${missingWordCount === 1 ? "" : "s"} not found anywhere in the transcript.`,
  };
}

export interface HealthOutcome {
  overallRating: HealthRating;
  categoryScores: HealthCategoryScore[];
}

/** Overall rating is the WORST category — a health summary that hid one bad category behind a good average would defeat the point of "surface recording health." */
export function generateHealthSnapshot(input: HealthInput): HealthOutcome {
  const categoryScores: HealthCategoryScore[] = [
    scoreTranscriptMatch(input.matchRatio),
    scorePronunciation(input.pronunciationFindingCount, input.scriptWordCount),
    scoreTiming(input.findings),
    scoreNoiseDetection(input.waveformPeaks),
    scoreConfidence(input.confidenceSamples),
    scoreCompleteness(input.findings, input.scriptWordCount),
  ];

  const overallRating = categoryScores.reduce<HealthRating>(
    (worst, score) => (RATING_RANK[score.rating] < RATING_RANK[worst] ? score.rating : worst),
    "excellent",
  );

  return { overallRating, categoryScores };
}
