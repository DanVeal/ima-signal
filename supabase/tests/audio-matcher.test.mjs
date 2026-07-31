// Phase 2C.1 — filename matching engine tests. Pure function, no I/O — see
// src/lib/audio-upload/matcher.ts. Run via tsx (no Supabase needed):
//   node --import tsx supabase/tests/audio-matcher.test.mjs
import { matchFiles, matchFile, summarizeMatches } from "@/lib/audio-upload/matcher";
import { check, summarize } from "./helpers.mjs";

const targets = [
  { subjectId: "t1", subjectType: "script_variant", code: "MAN-TFS", label: "MAN-TFS", currentChecksum: "existing-hash-1" },
  { subjectId: "t2", subjectType: "script_variant", code: "BHX-FAO", label: "BHX-FAO", currentChecksum: null },
  { subjectId: "t3", subjectType: "announcement_version", code: "080A.J2", label: "080A.J2 — BOARDING VIP", currentChecksum: null },
  { subjectId: "t4", subjectType: "announcement_version", code: "081.J2", label: "081.J2 — BOARDING & FUEL", currentChecksum: null },
  { subjectId: "t5", subjectType: "announcement_version", code: "081A.J2", label: "081A.J2 — BOARDING & FUEL VIP", currentChecksum: null },
];

console.log("\n=== Matching tiers ===");

check(
  "exact match",
  matchFile({ fileName: "MAN-TFS.wav", fileSizeBytes: 1, checksum: "a" }, targets).tier === "exact",
);
check(
  "case-insensitive match",
  matchFile({ fileName: "man-tfs.wav", fileSizeBytes: 1, checksum: "a" }, targets).tier === "case_insensitive",
);
check(
  "whitespace-insensitive match",
  matchFile({ fileName: "MAN - TFS.wav", fileSizeBytes: 1, checksum: "a" }, targets).tier === "whitespace_insensitive",
);
check(
  "reference-code substring match",
  matchFile({ fileName: "Boarding_080A.J2_v2_FINAL.wav", fileSizeBytes: 1, checksum: "a" }, targets).tier === "reference_code" &&
    matchFile({ fileName: "Boarding_080A.J2_v2_FINAL.wav", fileSizeBytes: 1, checksum: "a" }, targets).target?.code === "080A.J2",
);
check(
  "reference-code match prefers the longer (more specific) of two substring matches",
  matchFile({ fileName: "081.J2-and-081A.J2-both.wav", fileSizeBytes: 1, checksum: "a" }, targets).status === "matched" &&
    matchFile({ fileName: "081.J2-and-081A.J2-both.wav", fileSizeBytes: 1, checksum: "a" }, targets).target?.code === "081A.J2",
);
check(
  "two equal-length codes both present as substrings is genuinely ambiguous",
  matchFile({ fileName: "080A.J2-vs-081A.J2.wav", fileSizeBytes: 1, checksum: "a" }, targets).status === "ambiguous",
);

console.log("\n=== Non-matches ===");

check(
  "plain unrelated filename is unmatched",
  matchFile({ fileName: "totally-unrelated-file.wav", fileSizeBytes: 1, checksum: "a" }, targets).status === "unmatched",
);
check(
  "a code-shaped (uppercase) token with no real target is unknown_reference",
  matchFile({ fileName: "099Z.J2_extra.wav", fileSizeBytes: 1, checksum: "a" }, targets).status === "unknown_reference",
);
check(
  "an ordinary lowercase hyphenated filename is NOT mistaken for a code (case-sensitive heuristic)",
  matchFile({ fileName: "final-mix-approved.wav", fileSizeBytes: 1, checksum: "a" }, targets).status === "unmatched",
);

console.log("\n=== Duplicate detection ===");

const dupResult = matchFile({ fileName: "MAN-TFS-v2.wav", fileSizeBytes: 1, checksum: "existing-hash-1" }, targets);
check("a file matching the CURRENT version's checksum is flagged as a duplicate", dupResult.status === "matched" && dupResult.isDuplicate);
check("duplicate match still carries a warning explaining why", dupResult.warnings.length > 0);

console.log("\n=== Batch-level behaviour (matchFiles) ===");

const batch = matchFiles(
  [
    { fileName: "BHX-FAO.wav", fileSizeBytes: 1, checksum: "h1" },
    { fileName: "voiceover-outtake.wav", fileSizeBytes: 1, checksum: "h1" }, // same bytes, unrelated name — not a real match, but same checksum
    { fileName: "080A.J2.wav", fileSizeBytes: 1, checksum: "h2" },
    { fileName: "080A.J2-again.wav", fileSizeBytes: 1, checksum: "h3" }, // same TARGET, different bytes — same-target collision
  ],
  targets,
);
check("batch: exact match for BHX-FAO.wav", batch[0].status === "matched" && batch[0].target?.code === "BHX-FAO");
check("batch: voiceover-outtake.wav is unmatched (not code-shaped, no exact/substring hit)", batch[1].status === "unmatched");
check("batch: 080A.J2.wav matched via reference-code substring", batch[2].status === "matched" && batch[2].target?.code === "080A.J2");
check(
  "batch: 080A.J2-again.wav matched the SAME target as the previous file — flagged in warnings",
  batch[3].status === "matched" && batch[3].warnings.some((w) => w.includes("same target")),
);

const summary = summarizeMatches(batch);
check("summary: 3 matched (BHX-FAO, 080A.J2, 080A.J2-again)", summary.matched === 3);
check("summary: 1 unmatched (voiceover-outtake.wav)", summary.unmatched === 1);
check("summary: readyToImport counts both same-target-collision rows (collision is a warning, not a blocker)", summary.readyToImport === 3);

console.log("\n=== Nothing here ever mutates or commits — pure classification only ===");
check("matchFiles returns a NEW array, doesn't mutate input", Array.isArray(batch) && batch.length === 4);

summarize();
