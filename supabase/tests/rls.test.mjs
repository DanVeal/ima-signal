// RLS test suite (Phase 2A + 2B) — proves each role can only access/modify
// the rows it should, against the real local Supabase stack (real
// Postgres, real Auth, real PostgREST — not a mock). Run with:
//   node --env-file=.env.local supabase/tests/rls.test.mjs
import { check, serviceClient, signInAs, summarize } from "./helpers.mjs";

const PROJECT = {
  winterSunW1: "00000000-0000-0000-0000-000000000501",
  winterSunW2: "00000000-0000-0000-0000-000000000502",
  summerSale: "00000000-0000-0000-0000-000000000503",
  pramsJuly: "00000000-0000-0000-0000-000000000504",
};

const USER_PROFILE = {
  priya: "00000000-0000-0000-0000-000000000301", // ima_admin
  tom: "00000000-0000-0000-0000-000000000302", // ima_producer
  helen: "00000000-0000-0000-0000-000000000304", // jet2_reviewer
  ellie: "00000000-0000-0000-0000-000000000308", // studio_contributor
};

// Unique per run: this suite's own fixture projects can never actually be
// deleted once created (they log a projects_log_created activity_events row
// on insert, and — by design, per the append-only pre-check — a project can
// never be deleted once it has logged activity; see
// docs/phase-2b-limitations.md). A fixed job_number would collide with the
// previous run's undeleted row, so every run gets its own suffix.
const RUN_SUFFIX = process.hrtime.bigint().toString();

async function main() {
  const priya = await signInAs("priya.anand@ima.global"); // ima_admin
  const tom = await signInAs("tom.radcliffe@ima.global"); // ima_producer
  const helen = await signInAs("helen.marsh@jet2.com"); // jet2_reviewer
  const fatima = await signInAs("fatima.iqbal@jet2.com"); // jet2_view_only
  const ben = await signInAs("ben.foster@coastalsound.studio"); // studio_admin
  const ellie = await signInAs("ellie.nakamura@coastalsound.studio"); // studio_contributor

  console.log("\n1. Baseline project visibility (all 4 seed projects, one studio)");
  {
    const { data: asPriya } = await priya.from("projects").select("id");
    const { data: asHelen } = await helen.from("projects").select("id");
    const { data: asFatima } = await fatima.from("projects").select("id");
    const { data: asEllie } = await ellie.from("projects").select("id");
    check("ima_admin sees all 4 seed projects", (asPriya?.length ?? 0) >= 4);
    check("jet2_reviewer sees all 4 seed projects", (asHelen?.length ?? 0) >= 4);
    check("jet2_view_only sees all 4 seed projects", (asFatima?.length ?? 0) >= 4);
    check(
      "studio_contributor sees the 4 seed projects (their own studio)",
      (asEllie?.length ?? 0) >= 4,
    );
  }

  console.log("\n2. Cross-studio isolation (a project NOT assigned to Coastal Sound Studios)");
  let otherOrgId;
  let otherProjectId;
  {
    const { data: campaign } = await serviceClient
      .from("campaigns")
      .select("id")
      .limit(1)
      .single();
    const { data: org, error: orgErr } = await serviceClient
      .from("organisations")
      .insert({ type: "studio", name: "RLS Test — Other Studio" })
      .select()
      .single();
    if (orgErr) throw orgErr;
    otherOrgId = org.id;

    const { data: proj, error: projErr } = await serviceClient
      .from("projects")
      .insert({
        type: "standard_radio",
        campaign_id: campaign.id,
        name: "RLS Test — Other Studio Project",
        job_number: `RLS-TEST-0001-${RUN_SUFFIX}`,
        status: "draft_script",
        studio_organisation_id: otherOrgId,
      })
      .select()
      .single();
    if (projErr) throw projErr;
    otherProjectId = proj.id;

    const { data: asPriya } = await priya.from("projects").select("id").eq("id", otherProjectId);
    const { data: asHelen } = await helen.from("projects").select("id").eq("id", otherProjectId);
    const { data: asEllie } = await ellie.from("projects").select("id").eq("id", otherProjectId);
    const { data: asBen } = await ben.from("projects").select("id").eq("id", otherProjectId);

    check("ima_admin CAN see a project outside their studio", (asPriya?.length ?? 0) === 1);
    check("jet2_reviewer CAN see a project outside their studio", (asHelen?.length ?? 0) === 1);
    check(
      "studio_contributor CANNOT see another studio's project",
      (asEllie?.length ?? 0) === 0,
    );
    check("studio_admin CANNOT see another studio's project", (asBen?.length ?? 0) === 0);
  }

  console.log("\n3. Write permissions are gated to IMA admin/producer");
  {
    const { data: campaign } = await serviceClient
      .from("campaigns")
      .select("id")
      .limit(1)
      .single();
    const basePayload = {
      type: "standard_radio",
      campaign_id: campaign.id,
      status: "draft_script",
    };

    const { data: asPriya, error: errPriya } = await priya
      .from("projects")
      .insert({ ...basePayload, name: "RLS Test — by ima_admin", job_number: `RLS-TEST-0002-${RUN_SUFFIX}` })
      .select();
    check("ima_admin CAN create a project", !errPriya && asPriya?.length === 1);

    const { data: asTom, error: errTom } = await tom
      .from("projects")
      .insert({ ...basePayload, name: "RLS Test — by ima_producer", job_number: `RLS-TEST-0003-${RUN_SUFFIX}` })
      .select();
    check("ima_producer CAN create a project", !errTom && asTom?.length === 1);

    const { error: errHelen } = await helen
      .from("projects")
      .insert({ ...basePayload, name: "RLS Test — by jet2_reviewer", job_number: `RLS-TEST-0004-${RUN_SUFFIX}` })
      .select();
    check("jet2_reviewer CANNOT create a project", !!errHelen);

    const { error: errEllie } = await ellie
      .from("projects")
      .insert({
        ...basePayload,
        name: "RLS Test — by studio_contributor",
        job_number: `RLS-TEST-0005-${RUN_SUFFIX}`,
      })
      .select();
    check("studio_contributor CANNOT create a project", !!errEllie);
  }

  console.log("\n4. Global PRAMS registry: readable by all, writable by IMA managers only");
  {
    const { data: asEllie } = await ellie.from("prams_announcements").select("id");
    check(
      "studio_contributor CAN read the full announcement registry (116 seeded)",
      (asEllie?.length ?? 0) >= 116,
    );

    const { error: errEllieWrite } = await ellie
      .from("prams_announcements")
      .insert({ reference_code: "RLS-TEST.J2", current_title: "SHOULD NOT BE CREATED" })
      .select();
    check("studio_contributor CANNOT write to the announcement registry", !!errEllieWrite);

    const { data: asPriyaWrite, error: errPriyaWrite } = await priya
      .from("prams_announcements")
      .insert({ reference_code: "RLS-TEST-999.J2", current_title: "RLS test announcement" })
      .select();
    check(
      "ima_admin CAN write to the announcement registry",
      !errPriyaWrite && asPriyaWrite?.length === 1,
    );
    if (asPriyaWrite?.[0]?.id) {
      await serviceClient.from("prams_announcements").delete().eq("id", asPriyaWrite[0].id);
    }
  }

  console.log("\n5. user_profiles: self-update only");
  {
    const { data: ownUpdate } = await ellie
      .from("user_profiles")
      .update({ full_name: "Ellie Nakamura (RLS test)" })
      .eq("id", USER_PROFILE.ellie)
      .select();
    check("studio_contributor CAN update their own profile", ownUpdate?.length === 1);
    // restore
    await serviceClient
      .from("user_profiles")
      .update({ full_name: "Ellie Nakamura" })
      .eq("id", USER_PROFILE.ellie);

    const { data: otherUpdate } = await ellie
      .from("user_profiles")
      .update({ full_name: "Hijacked" })
      .eq("id", USER_PROFILE.tom)
      .select();
    check(
      "studio_contributor CANNOT update someone else's profile",
      (otherUpdate?.length ?? 0) === 0,
    );
    const { data: tomNow } = await serviceClient
      .from("user_profiles")
      .select("full_name")
      .eq("id", USER_PROFILE.tom)
      .single();
    check("the other profile's name is actually unchanged", tomNow?.full_name === "Tom Radcliffe");
  }

  console.log("\n6. activity_events: insert-only, never updatable (append-only audit log)");
  {
    const { data: inserted, error: insertErr } = await priya
      .from("activity_events")
      .insert({
        project_id: PROJECT.winterSunW1,
        entity_type: "test",
        entity_label: "RLS test event",
        action: "status_changed",
      })
      .select()
      .single();
    check("ima_admin CAN insert an activity event", !insertErr && !!inserted);

    if (inserted) {
      const { data: updated } = await priya
        .from("activity_events")
        .update({ entity_label: "tampered" })
        .eq("id", inserted.id)
        .select();
      check("activity_events rows CANNOT be updated by anyone (append-only)", (updated?.length ?? 0) === 0);
      await serviceClient.from("activity_events").delete().eq("id", inserted.id);
    }
  }

  console.log("\n7. Phase 2B: Standard Radio scripts write-gated to IMA managers");
  {
    const { data: script } = await serviceClient
      .from("scripts")
      .select("id")
      .eq("project_id", PROJECT.winterSunW1)
      .single();

    const { data: asHelen } = await helen.from("scripts").select("id").eq("project_id", PROJECT.winterSunW1);
    check("jet2_reviewer CAN read scripts", (asHelen?.length ?? 0) >= 1);

    const { error: errEllieWrite } = await ellie
      .from("script_variants")
      .insert({ script_id: script.id, variant_code: "RLS-TEST", column_order: 99 })
      .select();
    check("studio_contributor CANNOT create a script variant", !!errEllieWrite);

    const { data: asPriyaVariant, error: errPriyaVariant } = await priya
      .from("script_variants")
      .insert({ script_id: script.id, variant_code: "RLS-TEST", column_order: 99 })
      .select()
      .single();
    check("ima_admin CAN create a script variant", !errPriyaVariant && !!asPriyaVariant);

    if (asPriyaVariant) {
      // Revision immutability: insert is allowed, update is not (no UPDATE policy at all).
      const { data: revision, error: revErr } = await priya
        .from("script_revisions")
        .insert({ variant_id: asPriyaVariant.id, revision_number: 1, created_by_user_id: USER_PROFILE.priya })
        .select()
        .single();
      check("ima_admin CAN create a script revision", !revErr && !!revision);

      if (revision) {
        const { error: updateErr } = await priya
          .from("script_revisions")
          .update({ notes: "tampered" })
          .eq("id", revision.id);
        check(
          "script_revisions CANNOT be updated by anyone (immutable, no UPDATE policy)",
          !!updateErr,
        );
      }
      await serviceClient.from("script_variants").delete().eq("id", asPriyaVariant.id);
    }
  }

  console.log("\n8. Phase 2B: PRAMS matrix/import writes gated to IMA managers");
  {
    const { data: section } = await serviceClient
      .from("prams_sections")
      .select("id")
      .eq("project_id", PROJECT.pramsJuly)
      .eq("slug", "boarding")
      .single();

    const { error: errEllieRow } = await ellie
      .from("prams_matrix_rows")
      .insert({ section_id: section.id, row_key: "rls-test-row", sort_order: 999 })
      .select();
    check("studio_contributor CANNOT create a matrix row", !!errEllieRow);

    const { data: asPriyaRow, error: errPriyaRow } = await priya
      .from("prams_matrix_rows")
      .insert({ section_id: section.id, row_key: "rls-test-row", sort_order: 999 })
      .select()
      .single();
    check("ima_admin CAN create a matrix row", !errPriyaRow && !!asPriyaRow);

    const { error: errEllieImport } = await ellie
      .from("prams_workbook_imports")
      .insert({ project_id: PROJECT.pramsJuly, file_name: "rls-test.xlsx" })
      .select();
    check("studio_contributor CANNOT start a workbook import", !!errEllieImport);

    const { data: asPriyaImport, error: errPriyaImport } = await priya
      .from("prams_workbook_imports")
      .insert({ project_id: PROJECT.pramsJuly, file_name: "rls-test.xlsx" })
      .select()
      .single();
    check("ima_admin CAN start a workbook import", !errPriyaImport && !!asPriyaImport);

    if (asPriyaRow) await serviceClient.from("prams_matrix_rows").delete().eq("id", asPriyaRow.id);
    if (asPriyaImport) await serviceClient.from("prams_workbook_imports").delete().eq("id", asPriyaImport.id);
  }

  console.log("\n9. Phase 2B: wording RPC functions gated to IMA managers");
  {
    const { data: section } = await serviceClient
      .from("prams_sections")
      .select("id")
      .eq("project_id", PROJECT.pramsJuly)
      .eq("slug", "boarding")
      .single();
    const { data: row } = await serviceClient
      .from("prams_matrix_rows")
      .select("id")
      .eq("section_id", section.id)
      .eq("row_key", "row-7")
      .single();
    const { data: group } = await serviceClient
      .from("prams_wording_groups")
      .select("id")
      .eq("row_id", row.id)
      .single();

    const { error: errEllieEdit } = await ellie.rpc("edit_shared_wording", {
      p_wording_group_id: group.id,
      p_new_text: "should not be allowed",
    });
    check("studio_contributor CANNOT call edit_shared_wording", !!errEllieEdit);
  }

  console.log("\n10. Phase 2B pre-check: activity_events append-only holds even for service_role");
  {
    const { data: inserted } = await serviceClient
      .from("activity_events")
      .insert({
        project_id: PROJECT.winterSunW1,
        entity_type: "test",
        entity_label: "service-role append-only check",
        action: "status_changed",
      })
      .select()
      .single();

    const { error: updateErr } = await serviceClient
      .from("activity_events")
      .update({ entity_label: "tampered" })
      .eq("id", inserted.id);
    check(
      "activity_events UPDATE is rejected even for service_role (DB trigger, not just RLS)",
      !!updateErr,
    );

    const { error: deleteErr } = await serviceClient.from("activity_events").delete().eq("id", inserted.id);
    check(
      "activity_events DELETE is rejected even for service_role (DB trigger, not just RLS)",
      !!deleteErr,
    );
  }

  console.log("\n11. Phase 2B pre-check: reference code normalisation before uniqueness");
  {
    const { data: created, error: createErr } = await priya
      .from("prams_announcements")
      .insert({ reference_code: "  rls-normalize-test.j2  ", current_title: "Normalisation check" })
      .select()
      .single();
    check(
      "mixed-case/whitespace reference_code is normalised on write",
      !createErr && created?.reference_code === "RLS-NORMALIZE-TEST.J2",
    );
    check(
      "the original as-imported value is retained separately",
      created?.original_reference_code === "  rls-normalize-test.j2  ",
    );

    const { error: dupErr } = await priya
      .from("prams_announcements")
      .insert({ reference_code: "RLS-Normalize-Test.J2", current_title: "Duplicate attempt" })
      .select();
    check("a differently-cased duplicate is rejected by the unique constraint", !!dupErr);

    if (created) await serviceClient.from("prams_announcements").delete().eq("id", created.id);
  }

  console.log("\nCleaning up test fixtures...");
  await serviceClient.from("projects").delete().like("job_number", "RLS-TEST-%");
  if (otherProjectId) await serviceClient.from("projects").delete().eq("id", otherProjectId);
  if (otherOrgId) await serviceClient.from("organisations").delete().eq("id", otherOrgId);

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
