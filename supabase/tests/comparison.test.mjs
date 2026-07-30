// Phase 2B — structural comparison tests, formalizing the July-vs-October
// smoke test against the real seeded data. Read-only throughout. Run via
// tsx: `npx tsx supabase/tests/comparison.test.mjs`.
import { compareUpdates } from "@/lib/prams-matrix/comparison-service";
import { serviceClient, check, summarize } from "./helpers.mjs";

const JULY_PROJECT_ID = "00000000-0000-0000-0000-000000000504";
const OCTOBER_PROJECT_ID = "00000000-0000-0000-0000-000000000505";

console.log("\n=== compareUpdates: July 2026 vs October 2026 ===");

const result = await compareUpdates(serviceClient, JULY_PROJECT_ID, OCTOBER_PROJECT_ID);

check("new reference 115.J2 detected as added", result.added.some((a) => a.referenceCode === "115.J2"));
check("dropped reference 114.J2 detected as removed", result.removed.some((r) => r.referenceCode === "114.J2"));
check(
  "retitled reference 101.J2 detected as a title change",
  result.titleChanged.some(
    (t) => t.referenceCode === "101.J2" && t.after.includes("REVISED WORDING") && !t.before.includes("REVISED WORDING"),
  ),
);
check(
  "Boarding's 4 references (identical in both updates) are all reported unchanged",
  ["080.J2", "080A.J2", "081A.J2", "081.J2"].every((code) => result.unchanged.includes(code)),
);
check(
  "Safety Demonstration's other 13 references (untouched) are also reported unchanged",
  result.unchanged.length >= 4 + 13,
);
check(
  "a reference reported unchanged does NOT also appear in added/removed/titleChanged",
  result.unchanged.every(
    (code) =>
      !result.added.some((a) => a.referenceCode === code) &&
      !result.removed.some((r) => r.referenceCode === code) &&
      !result.titleChanged.some((t) => t.referenceCode === code),
  ),
);
check("sectionMoved is empty — nothing changed sections between these two updates", result.sectionMoved.length === 0);

console.log("\n=== compareUpdates: identical project against itself is a no-op diff ===");

const selfResult = await compareUpdates(serviceClient, JULY_PROJECT_ID, JULY_PROJECT_ID);
check("comparing an update against itself reports zero added", selfResult.added.length === 0);
check("comparing an update against itself reports zero removed", selfResult.removed.length === 0);
check("comparing an update against itself reports zero title changes", selfResult.titleChanged.length === 0);
check("comparing an update against itself reports zero wording changes", selfResult.wordingChanged.length === 0);
check("comparing an update against itself reports zero sharing changes", selfResult.sharingChanged.length === 0);
check("comparing an update against itself reports everything unchanged", selfResult.unchanged.length > 0);

summarize();
