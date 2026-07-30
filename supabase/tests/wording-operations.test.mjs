// Phase 2B — shared-edit / override / re-merge tests, formalizing the
// manual smoke test run during development. Exercises the three
// SECURITY INVOKER RPC functions as ima_admin (priya) against a throwaway
// row cloned from the real seeded Boarding matrix, so the real seed data
// is left untouched. Run via tsx: `npx tsx supabase/tests/wording-operations.test.mjs`.
import {
  editSharedWording,
  createVariantOverride,
  remergeWordingCells,
} from "@/lib/prams-matrix/wording-service";
import { serviceClient, signInAs, check, summarize } from "./helpers.mjs";

const JULY_PROJECT_ID = "00000000-0000-0000-0000-000000000504";
const BOARDING_SECTION_ID = "00000000-0000-0000-0000-000000000701";

// Build a throwaway row + fully-merged 4-cell wording group, mirroring the
// real row-7 shape, so edit/override/re-merge can be exercised without
// touching the real seeded row-7.
async function buildThrowawayMergedRow() {
  const { data: row, error: rowError } = await serviceClient
    .from("prams_matrix_rows")
    .insert({ section_id: BOARDING_SECTION_ID, row_key: `row-wording-test-${process.hrtime.bigint()}`, sort_order: 999 })
    .select()
    .single();
  if (rowError) throw rowError;

  const { data: versions } = await serviceClient
    .from("prams_announcement_versions")
    .select("id")
    .eq("project_id", JULY_PROJECT_ID)
    .eq("section_id", BOARDING_SECTION_ID);

  const cellIds = [];
  for (const v of versions) {
    const { data: cell, error: cellError } = await serviceClient
      .from("prams_matrix_cells")
      .insert({ row_id: row.id, announcement_version_id: v.id })
      .select()
      .single();
    if (cellError) throw cellError;
    cellIds.push(cell.id);
  }

  const { data: group, error: groupError } = await serviceClient
    .from("prams_wording_groups")
    .insert({ row_id: row.id, text: "Original shared wording for the test row.", source: "workbook_import" })
    .select()
    .single();
  if (groupError) throw groupError;

  const { error: memberError } = await serviceClient.from("prams_wording_group_members").insert(
    cellIds.map((cellId) => ({ wording_group_id: group.id, matrix_cell_id: cellId, is_current: true })),
  );
  if (memberError) throw memberError;

  return { row, cellIds, originalGroupId: group.id };
}

async function currentMembership(cellId) {
  const { data } = await serviceClient
    .from("prams_wording_group_members")
    .select("*, wording_group:prams_wording_groups(text)")
    .eq("matrix_cell_id", cellId)
    .eq("is_current", true)
    .single();
  return data;
}

async function latestActivity(projectId) {
  const { data } = await serviceClient
    .from("activity_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

const ima = await signInAs("priya.anand@ima.global");
const { row, cellIds, originalGroupId } = await buildThrowawayMergedRow();

console.log("\n=== editSharedWording ===");

const newGroupId = await editSharedWording(ima, originalGroupId, "Revised shared wording, edited for all 4 members.");
check("editSharedWording returns a new (different) group id", newGroupId !== originalGroupId);

const membershipsAfterEdit = await Promise.all(cellIds.map(currentMembership));
check(
  "editSharedWording: ALL 4 members now point at the new group",
  membershipsAfterEdit.every((m) => m.wording_group_id === newGroupId),
);
check(
  "editSharedWording: the new group carries the revised text",
  membershipsAfterEdit.every((m) => m.wording_group.text === "Revised shared wording, edited for all 4 members."),
);

const { data: originalGroupStillExists } = await serviceClient
  .from("prams_wording_groups")
  .select("*")
  .eq("id", originalGroupId)
  .single();
check(
  "editSharedWording: the previous revision's group row is preserved, not deleted",
  originalGroupStillExists?.text === "Original shared wording for the test row.",
);

const { data: retiredMemberships } = await serviceClient
  .from("prams_wording_group_members")
  .select("*")
  .eq("wording_group_id", originalGroupId);
check(
  "editSharedWording: the old memberships are retired (is_current=false), not deleted",
  retiredMemberships.length === 4 && retiredMemberships.every((m) => m.is_current === false),
);

const editActivity = await latestActivity(JULY_PROJECT_ID);
check("editSharedWording: writes an activity event", editActivity?.action === "wording_edited");
check(
  "editSharedWording: activity event records the exact affected announcements",
  Array.isArray(editActivity?.metadata?.affected_announcements) &&
    editActivity.metadata.affected_announcements.length === 4,
);

console.log("\n=== createVariantOverride ===");

const overrideCellId = cellIds[0];
const overrideGroupId = await createVariantOverride(ima, newGroupId, overrideCellId, "One variant's own override wording.");
check("createVariantOverride returns a new group id, distinct from the shared group", overrideGroupId !== newGroupId);

const overriddenMembership = await currentMembership(overrideCellId);
check("createVariantOverride: the overridden cell now points at its own new group", overriddenMembership.wording_group_id === overrideGroupId);

const remainingMemberships = await Promise.all(cellIds.slice(1).map(currentMembership));
check(
  "createVariantOverride: the OTHER 3 members are untouched, still on the shared group",
  remainingMemberships.every((m) => m.wording_group_id === newGroupId),
);

const overrideActivity = await latestActivity(JULY_PROJECT_ID);
check("createVariantOverride: writes an activity event recording the split", overrideActivity?.action === "override_created");

console.log("\n=== remergeWordingCells (re-merge requires the full cell set) ===");

const remergedGroupId = await remergeWordingCells(ima, cellIds, "Re-merged wording for all 4 variants.");
check("remergeWordingCells returns a fresh group id", remergedGroupId !== newGroupId && remergedGroupId !== overrideGroupId);

const membershipsAfterRemerge = await Promise.all(cellIds.map(currentMembership));
check(
  "remergeWordingCells: ALL 4 cells (including the former override) now share the re-merged group",
  membershipsAfterRemerge.every((m) => m.wording_group_id === remergedGroupId),
);

const { data: overrideGroupAfterRemerge } = await serviceClient
  .from("prams_wording_groups")
  .select("*")
  .eq("id", overrideGroupId)
  .single();
check(
  "remergeWordingCells: the override's group row is preserved (re-merge does not delete override history)",
  !!overrideGroupAfterRemerge,
);

const remergeActivity = await latestActivity(JULY_PROJECT_ID);
check("remergeWordingCells: writes an activity event recording the re-merge", remergeActivity?.action === "remerged");

console.log("\n=== Full lineage is queryable end-to-end ===");
const finalMembership = await currentMembership(cellIds[0]);
let lineageDepth = 0;
let cursor = finalMembership;
while (cursor?.replaces_membership_id) {
  lineageDepth += 1;
  const { data: prev } = await serviceClient
    .from("prams_wording_group_members")
    .select("*")
    .eq("id", cursor.replaces_membership_id)
    .single();
  cursor = prev;
}
check(
  "one cell's membership lineage chains back through override -> shared-edit -> original (depth >= 3)",
  lineageDepth >= 3,
);

// cleanup: throwaway row only — real seeded row-7 untouched throughout.
await serviceClient.from("prams_matrix_rows").delete().eq("id", row.id);

summarize();
