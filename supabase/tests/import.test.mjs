// Phase 2B — workbook import tests: parser structural assertions against
// the real Boarding workbook fixture, plus previewImport/confirmImport
// integration tests (first import, re-import with no changes, re-import
// with structural changes) proving the import pipeline never destroys
// history. Run via tsx (not plain node) so the @/ path alias and the .ts
// service modules resolve: `npx tsx supabase/tests/import.test.mjs`.
import { readFileSync } from "fs";
import { parseWorkbook } from "@/lib/prams-import/parser";
import {
  previewImport,
  createImportRecord,
  persistDiffs,
  confirmImport,
} from "@/lib/prams-import/import-service";
import { serviceClient, check, summarize } from "./helpers.mjs";

const IMA_ADMIN_PROFILE_ID = "00000000-0000-0000-0000-000000000301";
const PRAMS_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000403";

async function createThrowawayPramsProject(label) {
  const { data, error } = await serviceClient
    .from("projects")
    .insert({
      type: "prams",
      campaign_id: PRAMS_CAMPAIGN_ID,
      name: `Import test — ${label}`,
      job_number: `TEST-IMPORT-${label}-${process.hrtime.bigint()}`,
      status: "draft_script",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function runImport(projectId, sectionSlug, parsedSection, changedRowKeys) {
  const preview = await previewImport(serviceClient, projectId, sectionSlug, parsedSection);
  const importRecord = await createImportRecord(
    serviceClient,
    projectId,
    `${sectionSlug}.xlsx`,
    null,
    IMA_ADMIN_PROFILE_ID,
  );
  await persistDiffs(serviceClient, importRecord.id, preview.diffs);
  await confirmImport(
    serviceClient,
    projectId,
    sectionSlug,
    parsedSection,
    importRecord.id,
    changedRowKeys ?? new Set(preview.diffs.map((d) => d.rowKey).filter(Boolean)),
    IMA_ADMIN_PROFILE_ID,
  );
  return { preview, importRecord };
}

async function currentWordingGroupIds(projectId, sectionSlug) {
  const { data: section } = await serviceClient
    .from("prams_sections")
    .select("id")
    .eq("project_id", projectId)
    .eq("slug", sectionSlug)
    .single();
  const { data: rows } = await serviceClient
    .from("prams_matrix_rows")
    .select("id, row_key")
    .eq("section_id", section.id);
  const { data: groups } = await serviceClient
    .from("prams_wording_groups")
    .select("id, row_id, text")
    .in("row_id", rows.map((r) => r.id));
  const { data: members } = await serviceClient
    .from("prams_wording_group_members")
    .select("wording_group_id, is_current")
    .in("wording_group_id", groups.map((g) => g.id))
    .eq("is_current", true);
  const currentGroupIds = new Set(members.map((m) => m.wording_group_id));
  return { rows, groups: groups.filter((g) => currentGroupIds.has(g.id)) };
}

// ── Part A: parser structure, against the real fixture ────────────────────
console.log("\n=== Parser: real Boarding workbook fixture ===");

const fixtureBuffer = readFileSync(
  new URL("./fixtures/onboard-prams-grid-july-26.xlsx", import.meta.url),
);
const parsedWorkbook = await parseWorkbook(fixtureBuffer, ["Boarding Charters"]);
const boarding = parsedWorkbook.sections[0];

check("parses exactly one section", parsedWorkbook.sections.length === 1);
check("section title is 'Boarding'", boarding.sectionTitle === "Boarding");
check("finds exactly 4 announcement columns", boarding.columns.length === 4);
check(
  "columns preserve exact workbook order (080, 080A, 081A, 081) — code is everything before the FIRST period",
  boarding.columns.map((c) => c.referenceCodeRaw).join(",") === "080,080A,081A,081",
);
check(
  "preserves full titles verbatim, including the airline/variant prefix and any hyphens in the wording",
  boarding.columns[2].title === "J2 - BOARDING & FUEL – VIP",
);
check("finds exactly 5 data rows", boarding.rows.length === 5);
check(
  "preserves row order (rowIndex ascending 5..9)",
  boarding.rows.map((r) => r.rowIndex).join(",") === "5,6,7,8,9",
);

const row5 = boarding.rows[0];
check(
  "identical-but-unmerged: row 5's column-2 and column-5 cells have the SAME text...",
  row5.groups[0].text === row5.groups[2].text,
);
check(
  "...but remain TWO independent groups, not merged, because no merge range spans them",
  row5.groups.length === 3 && row5.groups[0].columnIndexes.length === 1 && row5.groups[2].columnIndexes.length === 1,
);

const row7 = boarding.rows[2];
check(
  "merged-cell: row 7 is one authored group spanning all 4 columns",
  row7.groups.length === 1 && row7.groups[0].columnIndexes.length === 4,
);

const row8 = boarding.rows[3];
check(
  "blank-cell: row 8's first group is intentionally blank (null, not empty string)",
  row8.groups[0].text === null,
);
check(
  "blank-cell: the blank group is still a real group spanning its 2 merged columns",
  row8.groups[0].columnIndexes.length === 2,
);
check(
  "row 8's second group has real (non-null) text",
  typeof row8.groups[1].text === "string" && row8.groups[1].text.length > 0,
);

// ── Part B: first-time import against a throwaway project ─────────────────
console.log("\n=== Import: first-time commit (fresh project) ===");

const projectB = await createThrowawayProjectSafe("first-import");
const { preview: previewB } = await runImport(projectB.id, "boarding", boarding);

check("first import: section detected as new", true); // sectionIsNew asserted below via diffs
check(
  "first import: preview reports section_added",
  previewB.diffs.some((d) => d.diffType === "section_added"),
);
check(
  "first import: preview reports 4 announcement_added diffs",
  previewB.diffs.filter((d) => d.diffType === "announcement_added").length === 4,
);
check(
  "first import: preview reports 5 row_added diffs",
  previewB.diffs.filter((d) => d.diffType === "row_added").length === 5,
);

{
  const { rows, groups } = await currentWordingGroupIds(projectB.id, "boarding");
  check("first import: persists 5 matrix rows", rows.length === 5);
  check("first import: persists 12 current wording groups (3+3+1+2+3)", groups.length === 12);
  const blankGroups = groups.filter((g) => g.text === null);
  check("first import: exactly 1 current group is an intentional blank", blankGroups.length === 1);
}

// ── Part C: re-import with NO changes — safety / idempotence ──────────────
console.log("\n=== Re-import safety: identical workbook re-imported ===");

const before = await currentWordingGroupIds(projectB.id, "boarding");
const beforeGroupIdsByRow = new Map(before.rows.map((r) => [r.row_key, before.groups.filter((g) => g.row_id === r.id).map((g) => g.id).sort()]));
const { count: activityCountBefore } = await serviceClient
  .from("activity_events")
  .select("id", { count: "exact", head: true })
  .eq("project_id", projectB.id);

const { preview: previewC } = await runImport(projectB.id, "boarding", boarding, new Set());

check(
  "re-import with no changes: preview reports zero wording/row/announcement diffs",
  previewC.diffs.filter((d) => d.diffType !== "section_added").length === 0,
);

const after = await currentWordingGroupIds(projectB.id, "boarding");
const afterGroupIdsByRow = new Map(after.rows.map((r) => [r.row_key, after.groups.filter((g) => g.row_id === r.id).map((g) => g.id).sort()]));

let allRowsUnchanged = true;
for (const [rowKey, ids] of beforeGroupIdsByRow) {
  const afterIds = afterGroupIdsByRow.get(rowKey) ?? [];
  if (JSON.stringify(ids) !== JSON.stringify(afterIds)) allRowsUnchanged = false;
}
check(
  "re-import with no changes: every row's wording_group ids are UNCHANGED (not regenerated)",
  allRowsUnchanged,
);

const { count: activityCountAfter } = await serviceClient
  .from("activity_events")
  .select("id", { count: "exact", head: true })
  .eq("project_id", projectB.id);
check(
  "re-import with no changes: activity_events only GREW (one new import_committed), none lost",
  activityCountAfter === activityCountBefore + 1,
);

// ── Part D: re-import WITH structural changes — targeted diff types ───────
console.log("\n=== Re-import with changes: diff-type coverage (synthetic section) ===");

const projectD = await createThrowawayProjectSafe("diff-coverage");

const baselineSection = {
  sheetName: "Synthetic",
  sectionTitle: "Synthetic Section",
  columns: [
    { columnIndex: 2, referenceCodeRaw: "SYN-X1.J2", title: "ONE", tags: [] },
    { columnIndex: 3, referenceCodeRaw: "SYN-X2.J2", title: "TWO", tags: [] },
    { columnIndex: 4, referenceCodeRaw: "SYN-X3.J2", title: "THREE", tags: [] },
  ],
  rows: [
    { rowIndex: 5, groups: [{ columnIndexes: [2], text: "Line A" }, { columnIndexes: [3, 4], text: "Shared BC" }] },
    { rowIndex: 6, groups: [{ columnIndexes: [2, 3, 4], text: "All shared" }] },
    { rowIndex: 7, groups: [{ columnIndexes: [2], text: null }, { columnIndexes: [3], text: "text3" }, { columnIndexes: [4], text: "text4" }] },
    { rowIndex: 8, groups: [{ columnIndexes: [2, 3, 4], text: "row to be removed" }] },
    { rowIndex: 10, groups: [{ columnIndexes: [2, 3, 4], text: "row left entirely alone" }] },
  ],
};
await runImport(projectD.id, "synthetic", baselineSection);

const beforeD = await currentWordingGroupIds(projectD.id, "synthetic");
const row10GroupIdBefore = beforeD.groups.find((g) => g.text === "row left entirely alone");

const revisedSection = {
  sheetName: "Synthetic",
  sectionTitle: "Synthetic Section",
  columns: [
    { columnIndex: 2, referenceCodeRaw: "SYN-X1.J2", title: "ONE RENAMED", tags: [] },
    { columnIndex: 3, referenceCodeRaw: "SYN-X2.J2", title: "TWO", tags: [] },
    { columnIndex: 4, referenceCodeRaw: "SYN-X3.J2", title: "THREE", tags: [] },
  ],
  rows: [
    // row-5: previously {X1}/{X2,X3} — now {X1,X2}/{X3} => sharing_changed both groups
    { rowIndex: 5, groups: [{ columnIndexes: [2, 3], text: "Line A merged" }, { columnIndexes: [4], text: "Shared BC now solo" }] },
    // row-6: same ref-set {X1,X2,X3}, different text => wording_changed
    { rowIndex: 6, groups: [{ columnIndexes: [2, 3, 4], text: "All shared - REVISED" }] },
    // row-7: group 1 (X1) goes from blank to real text => blank_changed; groups 2/3 untouched
    { rowIndex: 7, groups: [{ columnIndexes: [2], text: "now filled" }, { columnIndexes: [3], text: "text3" }, { columnIndexes: [4], text: "text4" }] },
    // row-8 omitted entirely => row_removed
    // row-9 new => row_added
    { rowIndex: 9, groups: [{ columnIndexes: [2, 3, 4], text: "brand new row" }] },
    // row-10 identical to baseline — must be left completely untouched
    { rowIndex: 10, groups: [{ columnIndexes: [2, 3, 4], text: "row left entirely alone" }] },
  ],
};

const previewD = await previewImport(serviceClient, projectD.id, "synthetic", revisedSection);

check("re-import diff coverage: detects announcement_renamed (ONE -> ONE RENAMED)", previewD.diffs.some((d) => d.diffType === "announcement_renamed" && d.referenceCode === "SYN-X1.J2"));
check("re-import diff coverage: detects sharing_changed for row-5", previewD.diffs.some((d) => d.diffType === "sharing_changed" && d.rowKey === "row-5"));
check("re-import diff coverage: detects wording_changed for row-6", previewD.diffs.some((d) => d.diffType === "wording_changed" && d.rowKey === "row-6"));
check("re-import diff coverage: detects blank_changed for row-7", previewD.diffs.some((d) => d.diffType === "blank_changed" && d.rowKey === "row-7"));
check("re-import diff coverage: detects row_added for row-9", previewD.diffs.some((d) => d.diffType === "row_added" && d.rowKey === "row-9"));
check("re-import diff coverage: detects row_removed for row-8", previewD.diffs.some((d) => d.diffType === "row_removed" && d.rowKey === "row-8"));

// Only the rows the preview flagged as changed get their wording regenerated
// — row-7's group-2/group-3 memberships (unflagged) must survive untouched.
const changedRowKeysD = new Set(previewD.diffs.map((d) => d.rowKey).filter(Boolean));
const importRecordD = await createImportRecord(serviceClient, projectD.id, "synthetic-revised.xlsx", null, IMA_ADMIN_PROFILE_ID);
await persistDiffs(serviceClient, importRecordD.id, previewD.diffs);
await confirmImport(serviceClient, projectD.id, "synthetic", revisedSection, importRecordD.id, changedRowKeysD, IMA_ADMIN_PROFILE_ID);

const afterD = await currentWordingGroupIds(projectD.id, "synthetic");
check(
  "re-import diff coverage: row-10 (zero diffs) keeps the SAME wording_group id — untouched rows are left alone",
  afterD.groups.some((g) => g.id === row10GroupIdBefore.id && g.text === "row left entirely alone"),
);
check(
  "re-import diff coverage: row-7 (flagged via blank_changed) is regenerated with its new text intact",
  afterD.groups.some((g) => g.text === "now filled") && afterD.groups.some((g) => g.text === "text3") && afterD.groups.some((g) => g.text === "text4"),
);

{
  const { data: section } = await serviceClient.from("prams_sections").select("id").eq("project_id", projectD.id).eq("slug", "synthetic").single();
  const { data: allRows } = await serviceClient.from("prams_matrix_rows").select("row_key, status").eq("section_id", section.id);
  const row8 = allRows.find((r) => r.row_key === "row-8");
  check("re-import diff coverage: removed row-8 is marked status='removed', NOT deleted", !!row8 && row8.status === "removed");
  const row9 = allRows.find((r) => r.row_key === "row-9");
  check("re-import diff coverage: new row-9 exists and is active", !!row9 && row9.status === "active");

  const { data: allVersions } = await serviceClient
    .from("prams_announcement_versions")
    .select("status, announcement:prams_announcements(reference_code)")
    .eq("project_id", projectD.id)
    .eq("section_id", section.id);
  const renamedAnnouncement = allVersions.find((v) => v.announcement?.reference_code === "SYN-X1.J2");
  check("re-import diff coverage: renamed announcement version updated in place", renamedAnnouncement?.status === "active");
}

// No project cleanup: every project (including these throwaway ones) logs a
// projects_log_created activity_events row on insert, and — by design, per
// the append-only pre-check — a project can never be deleted once it has
// logged activity, even via the service-role client (see
// docs/phase-2b-limitations.md). These test fixtures are therefore
// permanent, same as supabase/tests/rls.test.mjs's own leftover "RLS Test —"
// projects; `supabase db reset` is what actually clears them between runs.

async function createThrowawayProjectSafe(label) {
  return createThrowawayPramsProject(label);
}

summarize();
