/**
 * Categorizes a flagged word into one of the Phase 2C.3 pronunciation
 * categories (place / airport / destination / brand / person / general).
 * This is a lightweight dictionary-and-shape heuristic, not a real named-
 * entity model — see docs/intelligence-engine.md's Known Limitations.
 * "Only flag. Never assert": an uncategorized proper noun still gets
 * flagged, just under the honest catch-all 'general' category rather than
 * a guessed-wrong specific one.
 */
export type PronunciationCategory = "place_name" | "airport_name" | "destination_name" | "brand_name" | "person_name" | "general";

const BRAND_NAMES = new Set(["jet2", "jet2holidays", "jet2citybreaks", "jet2villas", "atol", "abta"]);

const AIRPORT_NAMES = new Set([
  "heathrow",
  "gatwick",
  "manchester",
  "birmingham",
  "stansted",
  "luton",
  "leeds",
  "bradford",
  "newcastle",
  "glasgow",
  "edinburgh",
  "bristol",
  "belfast",
  "eastmidlands",
]);

const DESTINATION_NAMES = new Set([
  "tenerife",
  "fuerteventura",
  "lanzarote",
  "grancanaria",
  "majorca",
  "mallorca",
  "ibiza",
  "menorca",
  "alicante",
  "malaga",
  "faro",
  "algarve",
  "antalya",
  "dalaman",
  "bodrum",
  "paphos",
  "larnaca",
  "rhodes",
  "corfu",
  "crete",
  "zante",
  "kefalonia",
  "sharmelsheikh",
  "hurghada",
  "dubrovnik",
  "reykjavik",
  "orlando",
  "newyork",
  "cancun",
]);

function normalizeForLookup(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function categorizePronunciationWord(word: string): PronunciationCategory {
  const key = normalizeForLookup(word);
  if (BRAND_NAMES.has(key)) return "brand_name";
  if (AIRPORT_NAMES.has(key)) return "airport_name";
  if (DESTINATION_NAMES.has(key)) return "destination_name";
  // A capitalized word matching none of the above but shaped like a place
  // (common geographic suffixes) reads more like a place than a person.
  if (/(ville|town|burgh|shire|land|port|beach|bay|island)$/i.test(key)) return "place_name";
  return "general";
}
