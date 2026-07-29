import type { QcResult } from "@/types/domain";
import { demoTranscriptWords, demoTranscriptWordsV1 } from "./data";

/**
 * QC results keyed by audio version id. Kept separate from data.ts so the
 * differences can reference real word timings from the transcript above —
 * this is what a real deterministic diff engine (Phase 6) would produce.
 */
export const qcByAudioVersionId: Record<string, QcResult> = {
  "av-mnc-tfs-1": {
    matchPercentage: 74,
    differences: [
      {
        id: "diff-v1-price",
        type: "price",
        severity: "critical",
        expectedText: "three ninety nine",
        actualText: "four fifty nine",
        startMs: demoTranscriptWordsV1[13].startMs,
        endMs: demoTranscriptWordsV1[15].endMs,
        scriptSectionRef: "Price line",
        confidence: 0.95,
      },
      {
        id: "diff-v1-legal",
        type: "legal_wording",
        severity: "important",
        expectedText: "Prices are per person, based on two adults sharing.",
        actualText: "Prices are per person, based on two sharing.",
        startMs: demoTranscriptWordsV1[29].startMs,
        endMs: demoTranscriptWordsV1[37].endMs,
        scriptSectionRef: "Mandatory wording",
        confidence: 0.88,
      },
    ],
  },
  "av-mnc-tfs-2": {
    matchPercentage: 97,
    differences: [
      {
        id: "diff-v2-brand",
        type: "replaced",
        severity: "minor",
        expectedText: "Jet2holidays",
        actualText: "Jet2 Holidays",
        startMs: demoTranscriptWords[6].startMs,
        endMs: demoTranscriptWords[7].endMs,
        scriptSectionRef: "Opening line",
        confidence: 0.97,
      },
      {
        id: "diff-v2-price-confidence",
        type: "price",
        severity: "uncertain",
        expectedText: "three ninety nine",
        actualText: "three ninety nine",
        startMs: demoTranscriptWords[13].startMs,
        endMs: demoTranscriptWords[16].endMs,
        scriptSectionRef: "Price line",
        confidence: 0.63,
      },
      {
        id: "diff-v2-url",
        type: "replaced",
        severity: "minor",
        expectedText: "jet2holidays.com",
        actualText: "jet2holidays dot com",
        startMs: demoTranscriptWords[43].startMs,
        endMs: demoTranscriptWords[45].endMs,
        scriptSectionRef: "Legal line",
        confidence: 0.71,
      },
    ],
  },
  "av-bhx-fao-1": {
    matchPercentage: 89,
    differences: [
      {
        id: "diff-bhx-legal",
        type: "legal_wording",
        severity: "important",
        expectedText: "ATOL protected. Terms apply, see jet2holidays.com.",
        actualText: "ATOL protected.",
        startMs: 24800,
        endMs: 26200,
        scriptSectionRef: "Legal line",
        confidence: 0.9,
      },
    ],
  },
  "av-lba-alc-1": {
    matchPercentage: 100,
    differences: [],
  },
};
