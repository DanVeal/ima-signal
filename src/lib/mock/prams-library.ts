/**
 * PRAMS project library — prototype only, no backend.
 *
 * A PRAMS project is structurally different from a Standard Radio project:
 * instead of a handful of hand-authored scripts, it is one complete PRAMS
 * update spanning many announcement sections and potentially 100+
 * announcement variants and audio files (see AGENTS brief, "PRAMS
 * organisation").
 *
 * Each announcement variant is still modelled as a `Script` + `AudioItem`
 * (the same reviewable-item shapes Standard Radio uses), so it can be
 * opened through the existing audio review workspace unchanged — an
 * announcement variant *is* the unit that receives audio, transcription,
 * review and approval, exactly like a radio script variant.
 *
 * Only the Boarding section carries real wording, transcribed from the
 * supplied workbook (see `./prams`). Every other section is represented
 * structurally — section names, announcement references, review/audio
 * status — purely to demonstrate scale. Their script *wording* is never
 * fabricated: it is left as an explicit "not yet transcribed" placeholder,
 * and those variants simply have no audio uploaded until they are.
 */
import type {
  ActivityEvent,
  AudioItem,
  AudioVersion,
  AudioVersionStatus,
  ChangeRequest,
  Project,
  ReviewComment,
  Script,
  TranscriptWord,
} from "@/types/domain";
import { BOARDING_PHASE } from "./prams";

export const PRAMS_PROJECT_ID = "proj-prams-july-2026";
export const PRAMS_CAMPAIGN_ID = "camp-prams";

export interface PramsSectionDef {
  id: string;
  name: string;
  /** True only for sections transcribed from the source workbook (Boarding today). */
  available: boolean;
}

export const PRAMS_SECTIONS: PramsSectionDef[] = [
  { id: "boarding", name: "Boarding", available: true },
  { id: "safety-demonstration", name: "Safety Demonstration", available: false },
  { id: "after-take-off", name: "After Take-off", available: false },
  { id: "in-flight", name: "In-flight", available: false },
  { id: "descent", name: "Descent", available: false },
  { id: "arrival", name: "Arrival", available: false },
  { id: "delays", name: "Delays", available: false },
  { id: "diversions", name: "Diversions", available: false },
  { id: "special-announcements", name: "Special Announcements", available: false },
];

export type PramsVariantStatus = "missing_audio" | "awaiting_review" | "changes_requested" | "approved";

export interface PramsVariantSummary {
  scriptId: string;
  audioItemId: string;
  sectionId: string;
  code: string;
  fullReference: string;
  tags: string[];
  status: PramsVariantStatus;
  versionCount: number;
}

/** Deterministic PRNG — mock data must be stable across server/client renders. */
function makeRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x7fffffff;
  };
}

function buildTranscriptFromText(text: string, seed: number): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rng = makeRng(seed);
  let cursor = 300;
  return words.map((word, index) => {
    const durationMs = 170 + Math.round(rng() * 140);
    const startMs = cursor;
    const endMs = startMs + durationMs;
    cursor = endMs + 40;
    return {
      id: `tw-${seed}-${index}`,
      word,
      startMs,
      endMs,
      confidence: Math.min(0.9 + rng() * 0.09, 0.99),
    };
  });
}

const STATUS_TO_AUDIO_STATUS: Record<Exclude<PramsVariantStatus, "missing_audio">, AudioVersionStatus> = {
  awaiting_review: "ready_for_jet2_review",
  changes_requested: "jet2_changes_requested",
  approved: "approved",
};

const TAG_CYCLE: string[][] = [[], ["VIP"], [], [], ["Fuel"], [], [], ["VIP", "Fuel"], [], [], [], []];
const STATUS_CYCLE: PramsVariantStatus[] = [
  "approved",
  "approved",
  "awaiting_review",
  "approved",
  "awaiting_review",
  "missing_audio",
  "approved",
  "awaiting_review",
  "changes_requested",
  "approved",
  "awaiting_review",
  "approved",
];

const SECTION_VARIANT_COUNTS: Record<string, number> = {
  "safety-demonstration": 15,
  "after-take-off": 11,
  "in-flight": 24,
  descent: 10,
  arrival: 17,
  delays: 13,
  diversions: 9,
  "special-announcements": 13,
};
// Boarding (4, real) + the counts above = 116 announcement variants in total.

const SECTION_CODE_BASE: Record<string, number> = {
  "safety-demonstration": 100,
  "after-take-off": 150,
  "in-flight": 190,
  descent: 230,
  arrival: 260,
  delays: 290,
  diversions: 320,
  "special-announcements": 350,
};

function tagSuffix(tags: string[]): string {
  if (tags.length === 0) return "";
  if (tags.includes("VIP") && tags.includes("Fuel")) return " – VIP / FUEL STOP";
  if (tags.includes("VIP")) return " – VIP";
  if (tags.includes("Fuel")) return " – FUEL STOP";
  return "";
}

interface BuiltVariant {
  summary: PramsVariantSummary;
  script: Script;
  audioItem: AudioItem;
}

function buildGeneratedVariant(
  section: PramsSectionDef,
  index: number,
  globalIndex: number,
  rng: () => number,
): BuiltVariant {
  const code = `${SECTION_CODE_BASE[section.id] + index}.J2`;
  const tags = TAG_CYCLE[globalIndex % TAG_CYCLE.length];
  const upperName = section.name.toUpperCase();
  const fullReference = `${code} - ${upperName}${tagSuffix(tags)}`;
  const status = STATUS_CYCLE[globalIndex % STATUS_CYCLE.length];
  const versionCount = status === "missing_audio" ? 0 : globalIndex % 7 === 0 ? 2 : 1;

  const scriptId = `prams-script-${section.id}-${index}`;
  const audioItemId = `prams-audio-${section.id}-${index}`;

  const script: Script = {
    id: scriptId,
    projectId: PRAMS_PROJECT_ID,
    title: `${upperName}${tagSuffix(tags)}`,
    variantCode: code,
    versions: [
      {
        id: `${scriptId}-v1`,
        scriptId,
        versionNumber: 1,
        body: `Wording for this announcement has not yet been transcribed from the source PRAMS workbook — ${section.name} is prototype-only in this build.`,
        isApprovedForRecording: false,
        createdByUserId: "user-tom",
        createdAt: "2026-07-06T09:00:00Z",
        notes: "Placeholder — awaiting transcription from the PRAMS workbook.",
      },
    ],
  };

  const versions: AudioVersion[] = [];
  for (let v = 1; v <= versionCount; v++) {
    const isLatest = v === versionCount;
    const versionStatus: AudioVersionStatus = isLatest
      ? STATUS_TO_AUDIO_STATUS[status === "missing_audio" ? "awaiting_review" : status]
      : "jet2_changes_requested";
    versions.push({
      id: `${audioItemId}-v${v}`,
      audioItemId,
      versionNumber: v,
      scriptVersionId: script.versions[0].id,
      status: versionStatus,
      isApproved: isLatest && status === "approved",
      approvedByUserId: isLatest && status === "approved" ? "user-helen" : undefined,
      approvedAt: isLatest && status === "approved" ? "2026-07-18T12:00:00Z" : undefined,
      uploadedByUserId: "user-ben",
      createdAt: `2026-07-${(10 + (globalIndex % 15)).toString().padStart(2, "0")}T09:${(globalIndex % 60)
        .toString()
        .padStart(2, "0")}:00Z`,
      durationSeconds: 8 + Math.round(rng() * 22),
      fileName: `${code.replace(".", "_")}_V${v}.wav`,
      transcriptionStatus: "failed",
      notes: undefined,
    });
  }

  return {
    summary: { scriptId, audioItemId, sectionId: section.id, code, fullReference, tags, status, versionCount },
    script,
    audioItem: { id: audioItemId, scriptId, versions },
  };
}

function buildBoardingVariants(): BuiltVariant[] {
  const boardingStatuses: Record<string, PramsVariantStatus> = {
    v080: "approved",
    v080a: "awaiting_review",
    v081a: "changes_requested",
    v081: "awaiting_review",
  };

  return BOARDING_PHASE.variants.map((variant, i) => {
    const status = boardingStatuses[variant.id] ?? "awaiting_review";
    const scriptId = `prams-script-${variant.id}`;
    const audioItemId = `prams-audio-${variant.id}`;

    const bodyLines = BOARDING_PHASE.lines
      .map((line) => line.groups.find((g) => g.variantIds.includes(variant.id))?.text)
      .filter((text): text is string => Boolean(text));
    const body = bodyLines.join(" ");

    const script: Script = {
      id: scriptId,
      projectId: PRAMS_PROJECT_ID,
      title: variant.fullReference,
      variantCode: variant.code,
      versions: [
        {
          id: `${scriptId}-v1`,
          scriptId,
          versionNumber: 1,
          body,
          isApprovedForRecording: true,
          approvedByUserId: "user-priya",
          approvedAt: "2026-07-09T10:00:00Z",
          createdByUserId: "user-tom",
          createdAt: "2026-07-06T09:00:00Z",
          notes: "Transcribed directly from the PRAMS workbook, Boarding Charters sheet.",
        },
      ],
    };

    const versionStatus = STATUS_TO_AUDIO_STATUS[status === "missing_audio" ? "awaiting_review" : status];
    const audioItem: AudioItem = {
      id: audioItemId,
      scriptId,
      versions: [
        {
          id: `${audioItemId}-v1`,
          audioItemId,
          versionNumber: 1,
          scriptVersionId: script.versions[0].id,
          status: versionStatus,
          isApproved: status === "approved",
          approvedByUserId: status === "approved" ? "user-helen" : undefined,
          approvedAt: status === "approved" ? "2026-07-18T12:00:00Z" : undefined,
          uploadedByUserId: "user-ben",
          createdAt: "2026-07-14T10:20:00Z",
          durationSeconds: Math.max(6, Math.round(body.split(/\s+/).length * 0.42)),
          fileName: `${variant.code.replace(".", "_")}_V1.wav`,
          transcriptionStatus: "ready_for_review",
          overallConfidence: 0.95,
          transcript: buildTranscriptFromText(body, i + 1),
        },
      ],
    };

    return {
      summary: {
        scriptId,
        audioItemId,
        sectionId: "boarding",
        code: variant.code,
        fullReference: variant.fullReference,
        tags: variant.tags,
        status,
        versionCount: 1,
      },
      script,
      audioItem,
    };
  });
}

const rng = makeRng(20260701);
const builtVariants: BuiltVariant[] = [...buildBoardingVariants()];

let globalIndex = 0;
for (const section of PRAMS_SECTIONS) {
  if (section.id === "boarding") continue;
  const count = SECTION_VARIANT_COUNTS[section.id] ?? 0;
  for (let i = 0; i < count; i++) {
    builtVariants.push(buildGeneratedVariant(section, i, globalIndex, rng));
    globalIndex++;
  }
}

export const PRAMS_VARIANTS: PramsVariantSummary[] = builtVariants.map((v) => v.summary);
export const pramsScripts: Script[] = builtVariants.map((v) => v.script);
export const pramsAudioItems: AudioItem[] = builtVariants.map((v) => v.audioItem);

export const pramsProject: Project = {
  id: PRAMS_PROJECT_ID,
  type: "prams",
  campaignId: PRAMS_CAMPAIGN_ID,
  name: "PRAMS — July 2026 Update",
  jobNumber: "JET-PRAMS-2026-07",
  description:
    "The full July 2026 onboard-announcement release: every PRAMS section, announcement variant and audio recording for this update cycle.",
  status: "ready_for_jet2_review",
  ownerUserId: "user-tom",
  jet2ReviewerUserIds: ["user-helen", "user-craig"],
  studioOrganisationId: "org-studio",
  recordingDeadline: "2026-08-01",
  internalReviewDeadline: "2026-08-08",
  clientReviewDeadline: "2026-08-15",
  liveDate: "2026-08-22",
  expectedDurationSeconds: 0,
  audioFormat: "WAV 48kHz / 16-bit, broadcast mono",
  briefingNotes:
    "July 2026 PRAMS release. Boarding has been fully transcribed and matched against the supplied workbook; remaining sections are being brought in section by section.",
  mandatoryWording: [],
  importantClaims: [],
  deliveryNotes: "Deliver as one WAV per announcement variant, named to match its PRAMS reference.",
};

export const pramsComments: ReviewComment[] = [
  {
    id: "prams-comment-1",
    projectId: PRAMS_PROJECT_ID,
    audioVersionId: "prams-audio-v081a-v1",
    scriptVersionId: "prams-script-v081a-v1",
    selectedText: "Just so you know, the aircraft is being refuelled.",
    authorUserId: "user-craig",
    authorOrganisationId: "org-jet2",
    category: "wording",
    body: "Ops have asked that the fuel-stop safety line open with \"For your safety\" rather than \"Just so you know\" — flagging as a change request.",
    status: "open",
    createdAt: "2026-07-19T11:15:00Z",
    replies: [],
  },
];

export const pramsChangeRequests: ChangeRequest[] = [
  {
    id: "prams-cr-1",
    projectId: PRAMS_PROJECT_ID,
    audioVersionId: "prams-audio-v081a-v1",
    scriptVersionId: "prams-script-v081a-v1",
    selectedText: "Just so you know, the aircraft is being refuelled.",
    requestedReplacement: "For your safety, the aircraft is being refuelled.",
    note: "Ops-requested wording change on the fuel-stop safety line — needs a variant-specific override, not a shared edit (it only applies to the VIP fuel-stop variant).",
    category: "wording",
    priority: "high",
    assignedOrganisationId: "org-ima",
    dueDate: "2026-08-01",
    status: "open",
    reviewerUserId: "user-craig",
    createdAt: "2026-07-19T11:20:00Z",
  },
];

export const pramsActivityEvents: ActivityEvent[] = [
  {
    id: "prams-act-1",
    actorUserId: "user-tom",
    organisationId: "org-ima",
    projectId: PRAMS_PROJECT_ID,
    entityType: "project",
    entityLabel: "PRAMS — July 2026 Update",
    action: "project_created",
    createdAt: "2026-07-01T09:00:00Z",
  },
  {
    id: "prams-act-2",
    actorUserId: "user-tom",
    organisationId: "org-ima",
    projectId: PRAMS_PROJECT_ID,
    entityType: "script",
    entityLabel: "Boarding — 4 announcement variants",
    action: "script_created",
    createdAt: "2026-07-06T09:00:00Z",
  },
  {
    id: "prams-act-3",
    actorUserId: "user-craig",
    organisationId: "org-jet2",
    projectId: PRAMS_PROJECT_ID,
    entityType: "change_request",
    entityLabel: "081A.J2 - BOARDING & FUEL – VIP",
    action: "change_request_created",
    createdAt: "2026-07-19T11:20:00Z",
  },
];

export function getPramsSectionSummary(sectionId: string) {
  const section = PRAMS_SECTIONS.find((s) => s.id === sectionId);
  const variants = PRAMS_VARIANTS.filter((v) => v.sectionId === sectionId);
  const approved = variants.filter((v) => v.status === "approved").length;
  const awaitingReview = variants.filter((v) => v.status === "awaiting_review").length;
  const changesRequested = variants.filter((v) => v.status === "changes_requested").length;
  const missingAudio = variants.filter((v) => v.status === "missing_audio").length;
  const recordingProgress = variants.length === 0 ? 0 : Math.round(((variants.length - missingAudio) / variants.length) * 100);
  return {
    section,
    variantCount: variants.length,
    approved,
    awaitingReview,
    changesRequested,
    missingAudio,
    recordingProgress,
    needsAttention: changesRequested + missingAudio,
  };
}

export function getAllPramsSectionSummaries() {
  return PRAMS_SECTIONS.map((s) => getPramsSectionSummary(s.id));
}

export function getPramsOverviewStats() {
  const totalVariants = PRAMS_VARIANTS.length;
  const totalAudioFiles = PRAMS_VARIANTS.reduce((sum, v) => sum + v.versionCount, 0);
  const approved = PRAMS_VARIANTS.filter((v) => v.status === "approved").length;
  const awaitingReview = PRAMS_VARIANTS.filter((v) => v.status === "awaiting_review").length;
  const changesRequested = PRAMS_VARIANTS.filter((v) => v.status === "changes_requested").length;
  const missingAudio = PRAMS_VARIANTS.filter((v) => v.status === "missing_audio").length;
  return { totalVariants, totalAudioFiles, approved, awaitingReview, changesRequested, missingAudio };
}

export interface PramsAttentionItem extends PramsVariantSummary {
  sectionName: string;
  reason: string;
}

export function getPramsNeedsAttention(limit = 6): { items: PramsAttentionItem[]; total: number } {
  const flagged = PRAMS_VARIANTS.filter((v) => v.status === "changes_requested" || v.status === "missing_audio").map(
    (v) => {
      const section = PRAMS_SECTIONS.find((s) => s.id === v.sectionId);
      return {
        ...v,
        sectionName: section?.name ?? v.sectionId,
        reason: v.status === "changes_requested" ? "Changes requested" : "Missing audio",
      };
    },
  );
  // Changes requested first — these are blocking a decision already made; missing audio simply hasn't started.
  const sorted = [...flagged].sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "changes_requested" ? -1 : 1;
  });
  return { items: sorted.slice(0, limit), total: sorted.length };
}

export interface PramsSearchFilters {
  query?: string;
  sectionId?: string;
  status?: PramsVariantStatus;
}

export function searchPramsVariants(filters: PramsSearchFilters): PramsVariantSummary[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  return PRAMS_VARIANTS.filter((v) => {
    const matchesQuery =
      query.length === 0 || v.fullReference.toLowerCase().includes(query) || v.code.toLowerCase().includes(query);
    const matchesSection = !filters.sectionId || v.sectionId === filters.sectionId;
    const matchesStatus = !filters.status || v.status === filters.status;
    return matchesQuery && matchesSection && matchesStatus;
  });
}

export function getPramsSectionName(sectionId: string): string {
  return PRAMS_SECTIONS.find((s) => s.id === sectionId)?.name ?? sectionId;
}

export function getPramsSectionIdForScript(scriptId: string): string | undefined {
  return PRAMS_VARIANTS.find((v) => v.scriptId === scriptId)?.sectionId;
}

export function getPramsVariantByScriptId(scriptId: string): PramsVariantSummary | undefined {
  return PRAMS_VARIANTS.find((v) => v.scriptId === scriptId);
}
