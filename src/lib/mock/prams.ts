/**
 * PRAMS Matrix — prototype only, no backend.
 *
 * PRAMS is Jet2's own onboard-announcement production document — a
 * standing library of numbered announcements, organised by flight phase
 * (Boarding, Safety Demonstration, After Take-off, Arrival, and others),
 * with announcement variants for circumstances such as a VIP service or
 * a fuel-stop routing.
 *
 * The Boarding data below is transcribed directly from the supplied
 * workbook (Onboard PRAMS Grid — July 26 Changes), "Boarding Charters"
 * sheet: the four announcement references and titles in row 4, and the
 * spoken lines and merged ranges in rows 5–9, are copied as given —
 * including cells that are genuinely blank in the source. Nothing here
 * has been invented or filled in. Other phases (Safety Demonstration,
 * After Take-off, Arrival) are not yet transcribed and are marked as
 * such in the UI rather than filled with placeholder content.
 */

export type PramsApprovalStatus = "draft" | "ready_for_review" | "approved";

export interface PramsVariant {
  id: string;
  /** The announcement code, e.g. "080.J2" — shown secondary to the full reference. */
  code: string;
  /** The full reference as it appears in the source, e.g. "080.J2 - BOARDING". */
  fullReference: string;
  /** Searchable attributes only — never a substitute for the full reference above. */
  tags: string[];
}

/** One cell (or merged span) in a script line: which variants it covers, and its wording. */
export interface PramsCellGroup {
  variantIds: string[];
  /** null = intentionally blank in the source — no wording is required here. */
  text: string | null;
}

export interface PramsLine {
  id: string;
  groups: PramsCellGroup[];
}

export interface PramsPhase {
  id: string;
  name: string;
  updateLabel: string;
  approvalStatus: PramsApprovalStatus;
  variants: PramsVariant[];
  lines: PramsLine[];
  /** Where this content came from, for traceability — not shown as a claim of completeness. */
  source: string;
}

const BOARDING_VARIANTS: PramsVariant[] = [
  { id: "v080", code: "080.J2", fullReference: "080.J2 - BOARDING", tags: [] },
  { id: "v080a", code: "080A.J2", fullReference: "080A.J2 - BOARDING – VIP", tags: ["VIP"] },
  {
    id: "v081a",
    code: "081A.J2",
    fullReference: "081A.J2 - BOARDING & FUEL – VIP",
    tags: ["VIP", "Fuel"],
  },
  { id: "v081", code: "081.J2", fullReference: "081.J2 - BOARDING & FUEL", tags: ["Fuel"] },
];

const [V080, V080A, V081A, V081] = BOARDING_VARIANTS.map((v) => v.id);

const BOARDING_LINES: PramsLine[] = [
  {
    id: "line-1",
    groups: [
      { variantIds: [V080], text: "Hello and welcome onboard this Jet2.com flight." },
      { variantIds: [V080A, V081A], text: "Hello and welcome onboard." },
      { variantIds: [V081], text: "Hello and welcome onboard this Jet2.com flight." },
    ],
  },
  {
    id: "line-2",
    groups: [
      {
        variantIds: [V080],
        text: "It's nearly time for take-off, so please find your seat as quickly as you can and get comfy.",
      },
      {
        variantIds: [V080A, V081A],
        text: "It's nearly time for take-off, so please find your seat and get comfortable.",
      },
      {
        variantIds: [V081],
        text: "It's nearly time for take-off, so please find your seat as quickly as you can and get comfy.",
      },
    ],
  },
  {
    id: "line-3",
    groups: [
      {
        variantIds: [V080, V080A, V081A, V081],
        text: "Small bags and anything containing powerbanks or glass bottles must be put underneath the seat in front of you. And make sure the aisle and exit areas are nice and clear.",
      },
    ],
  },
  {
    id: "line-4",
    groups: [
      { variantIds: [V080, V080A], text: null },
      {
        variantIds: [V081A, V081],
        text: "Just so you know, the aircraft is being refuelled. For your safety while we do this, please switch off all phones, tablets and other devices. Please stay seated with your seat belt unfastened. And remember, smoking and vaping are not allowed.",
      },
    ],
  },
  {
    id: "line-5",
    groups: [
      { variantIds: [V080], text: "If you need a hand, we'll be happy to help. Have a lovely flight!" },
      {
        variantIds: [V080A, V081A],
        text: "If there is anything we can help you with, please let a member of the cabin crew know.",
      },
      { variantIds: [V081], text: "If you need a hand, we'll be happy to help. Have a lovely flight!" },
    ],
  },
];

export const BOARDING_PHASE: PramsPhase = {
  id: "boarding",
  name: "Boarding",
  updateLabel: "July 2026 Update",
  approvalStatus: "ready_for_review",
  variants: BOARDING_VARIANTS,
  lines: BOARDING_LINES,
  source: "Onboard PRAMS Grid — July 26 Changes.xlsx, “Boarding Charters” sheet",
};

/** Phases named in the brief that aren't transcribed from the workbook yet. */
export const UPCOMING_PHASES = ["Safety Demonstration", "After Take-off", "Arrival"];
