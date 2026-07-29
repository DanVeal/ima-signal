/**
 * PRAMS Matrix — prototype only, no backend. Demonstrates how a shared
 * production brief (the "PRAMS" spreadsheet producers already work from)
 * could become an interactive, first-class screen instead of a flat
 * spreadsheet — while staying just as familiar: sections down the side,
 * variants across the top.
 *
 * Each script variant is built from a small number of sections. A section
 * is either:
 *  - shared        — identical wording, used by every variant
 *  - optional      — only included in some variants
 *  - variant       — genuinely different wording per variant
 */
import { scripts } from "./data";

export type PramsSectionKind = "shared" | "optional" | "variant";

export interface PramsSection {
  id: string;
  label: string;
  kind: PramsSectionKind;
}

export interface PramsCell {
  scriptId: string;
  included: boolean;
  text: string;
}

export interface PramsRow {
  section: PramsSection;
  cells: Record<string, PramsCell>;
}

export const PRAMS_SECTIONS: PramsSection[] = [
  { id: "opening", label: "Opening hook", kind: "variant" },
  { id: "price", label: "Price line", kind: "variant" },
  { id: "dates", label: "Sale dates", kind: "shared" },
  { id: "baggage", label: "Baggage allowance", kind: "optional" },
  { id: "mandatory", label: "Mandatory pricing wording", kind: "shared" },
  { id: "legal", label: "ATOL & legal wording", kind: "shared" },
];

const OPENINGS: Record<string, string> = {
  "script-mnc-tfs": "Escape to Tenerife this winter with Jet2holidays, flying direct from Manchester.",
  "script-bhx-fao": "The Algarve is closer than you think — direct from Birmingham to Faro.",
  "script-lba-alc": "Costa Blanca sunshine, direct from Leeds Bradford to Alicante.",
  "script-gla-acy": "Year-round sunshine is waiting in Lanzarote, direct from Glasgow.",
  "script-lpl-fue": "Golden beaches, direct from Liverpool to Fuerteventura.",
};

const PRICES: Record<string, string> = {
  "script-mnc-tfs": "From £399pp, based on two adults sharing.",
  "script-bhx-fao": "From £429pp, based on two adults sharing.",
  "script-lba-alc": "From £389pp, based on two adults sharing.",
  "script-gla-acy": "From £419pp, based on two adults sharing.",
  "script-lpl-fue": "From £409pp, based on two adults sharing.",
};

const SHARED_DATES = "Selected dates in November and December.";
const SHARED_MANDATORY = "Prices are per person, based on two adults sharing.";
const SHARED_LEGAL = "ATOL protected. Terms apply, see jet2holidays.com.";
const BAGGAGE_LINE = "Free 22kg baggage allowance included.";

// Which variants currently carry the (optional) baggage line — a
// deliberately uneven spread, so the matrix has something worth spotting.
const BAGGAGE_INCLUDED = new Set(["script-mnc-tfs", "script-bhx-fao"]);

export function getPramsRows(projectId: string): PramsRow[] {
  const projectScripts = scripts.filter((s) => s.projectId === projectId);

  return PRAMS_SECTIONS.map((section) => {
    const cells: Record<string, PramsCell> = {};
    for (const script of projectScripts) {
      cells[script.id] = buildCell(section, script.id);
    }
    return { section, cells };
  });
}

function buildCell(section: PramsSection, scriptId: string): PramsCell {
  switch (section.id) {
    case "opening":
      return { scriptId, included: true, text: OPENINGS[scriptId] ?? "" };
    case "price":
      return { scriptId, included: true, text: PRICES[scriptId] ?? "" };
    case "dates":
      return { scriptId, included: true, text: SHARED_DATES };
    case "mandatory":
      return { scriptId, included: true, text: SHARED_MANDATORY };
    case "legal":
      return { scriptId, included: true, text: SHARED_LEGAL };
    case "baggage":
      return {
        scriptId,
        included: BAGGAGE_INCLUDED.has(scriptId),
        text: BAGGAGE_INCLUDED.has(scriptId) ? BAGGAGE_LINE : "",
      };
    default:
      return { scriptId, included: false, text: "" };
  }
}
