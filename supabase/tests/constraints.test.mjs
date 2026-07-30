// Phase 2B — database constraint tests: uniqueness, check constraints, and
// the partial unique index that enforces "at most one current wording group
// membership per matrix cell". These exercise the schema directly with the
// service-role client (RLS is a separate concern, covered in rls.test.mjs);
// a constraint that only holds for `authenticated` isn't a real constraint.
import { serviceClient, check, summarize } from "./helpers.mjs";

const JULY_PROJECT_ID = "00000000-0000-0000-0000-000000000504";
const BOARDING_SECTION_ID = "00000000-0000-0000-0000-000000000701";
const SCRIPT_ID = "00000000-0000-0000-0000-000000000801";
const VARIANT_MAN_TFS = "00000000-0000-0000-0000-000000000811";
const REVISION_MAN_TFS = "00000000-0000-0000-0000-000000000821";

async function expectUniqueViolation(promise, label) {
  const { error } = await promise;
  check(`${label} — rejected with a unique-violation`, !!error && error.code === "23505");
}

async function expectCheckViolation(promise, label) {
  const { error } = await promise;
  check(`${label} — rejected by a check constraint`, !!error && error.code === "23514");
}

console.log("\n=== Standard Radio constraints ===");

await expectUniqueViolation(
  serviceClient.from("script_variants").insert({
    script_id: SCRIPT_ID,
    variant_code: "MAN-TFS", // already used by the seeded MAN-TFS variant
    destination: "Duplicate",
  }),
  "script_variants unique(script_id, variant_code)",
);

await expectUniqueViolation(
  serviceClient.from("script_revisions").insert({
    variant_id: VARIANT_MAN_TFS,
    revision_number: 1, // already exists for this variant
  }),
  "script_revisions unique(variant_id, revision_number)",
);

await expectUniqueViolation(
  serviceClient.from("script_lines").insert({
    revision_id: REVISION_MAN_TFS,
    sort_order: 1, // already occupied
    text: "Duplicate sort order.",
  }),
  "script_lines unique(revision_id, sort_order)",
);

{
  const { error } = await serviceClient.from("scripts").insert({
    project_id: JULY_PROJECT_ID, // a prams project, not standard_radio
    title: "Should be rejected",
  });
  check(
    "scripts.project_id trigger rejects a non-standard_radio project",
    !!error && /standard_radio/i.test(error.message ?? ""),
  );
}

console.log("\n=== PRAMS matrix constraints ===");

await expectUniqueViolation(
  serviceClient.from("prams_matrix_rows").insert({
    section_id: BOARDING_SECTION_ID,
    row_key: "row-5", // already exists in this section
    sort_order: 99,
  }),
  "prams_matrix_rows unique(section_id, row_key)",
);

{
  const { data: row } = await serviceClient
    .from("prams_matrix_rows")
    .select("id")
    .eq("section_id", BOARDING_SECTION_ID)
    .eq("row_key", "row-5")
    .single();
  const { data: cell } = await serviceClient
    .from("prams_matrix_cells")
    .select("id, announcement_version_id")
    .eq("row_id", row.id)
    .limit(1)
    .single();

  await expectUniqueViolation(
    serviceClient.from("prams_matrix_cells").insert({
      row_id: row.id,
      announcement_version_id: cell.announcement_version_id, // same coordinate again
    }),
    "prams_matrix_cells unique(row_id, announcement_version_id)",
  );

  // The partial unique index (one current membership per cell): the seeded
  // cell already has an is_current=true membership, so inserting a second
  // current membership for the SAME cell (even under a different group)
  // must fail, while inserting a non-current (historical) one succeeds.
  const { data: group } = await serviceClient
    .from("prams_wording_groups")
    .insert({ row_id: row.id, text: "Constraint-test duplicate current membership", source: "manual_shared_edit" })
    .select()
    .single();

  await expectUniqueViolation(
    serviceClient.from("prams_wording_group_members").insert({
      wording_group_id: group.id,
      matrix_cell_id: cell.id,
      is_current: true,
    }),
    "prams_wording_group_members_one_current_per_cell (second is_current=true for same cell)",
  );

  const { error: historicalError } = await serviceClient.from("prams_wording_group_members").insert({
    wording_group_id: group.id,
    matrix_cell_id: cell.id,
    is_current: false,
  });
  check(
    "a second membership for the same cell IS allowed when is_current=false",
    !historicalError,
  );
}

console.log("\n=== Check constraints ===");

await expectCheckViolation(
  serviceClient.from("prams_wording_groups").insert({
    row_id: (
      await serviceClient
        .from("prams_matrix_rows")
        .select("id")
        .eq("section_id", BOARDING_SECTION_ID)
        .eq("row_key", "row-5")
        .single()
    ).data.id,
    text: "Invalid source",
    source: "not_a_real_source",
  }),
  "prams_wording_groups.source check constraint",
);

await expectCheckViolation(
  serviceClient.from("prams_matrix_rows").insert({
    section_id: BOARDING_SECTION_ID,
    row_key: "row-constraint-test",
    sort_order: 99,
    status: "not_a_real_status",
  }),
  "prams_matrix_rows.status check constraint",
);

await expectCheckViolation(
  serviceClient.from("prams_workbook_imports").insert({
    project_id: JULY_PROJECT_ID,
    file_name: "constraint-test.xlsx",
    status: "not_a_real_status",
  }),
  "prams_workbook_imports.status check constraint",
);

await expectCheckViolation(
  serviceClient.from("prams_workbook_import_diffs").insert({
    import_id: (
      await serviceClient
        .from("prams_workbook_imports")
        .insert({ project_id: JULY_PROJECT_ID, file_name: "constraint-test-2.xlsx" })
        .select()
        .single()
    ).data.id,
    diff_type: "not_a_real_diff_type",
    section_slug: "boarding",
    payload: {},
  }),
  "prams_workbook_import_diffs.diff_type check constraint",
);

console.log("\n=== Global announcement registry ===");

await expectUniqueViolation(
  serviceClient.from("prams_announcements").insert({
    reference_code: "080.J2", // normalizes to the same code as the seeded one
    current_title: "Duplicate",
  }),
  "prams_announcements unique reference_code",
);

summarize();
