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
    // .limit(1) rather than .single(): other test suites (audio-upload.test.mjs)
    // add their own throwaway scripts under this same real project, so more
    // than one row can legitimately exist here on a re-run without a reset.
    const { data: scripts } = await serviceClient
      .from("scripts")
      .select("id")
      .eq("project_id", PROJECT.winterSunW1)
      .order("created_at")
      .limit(1);
    const script = scripts[0];

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

  console.log("\n12. Phase 2C.1: audio domain (audio_items/audio_versions + Storage)");
  {
    // A real, currently-audio-less Standard Radio variant under the same
    // project ellie's studio (Coastal Sound) already owns — winterSunW1 is
    // assigned to Coastal Sound in the seed data.
    const { data: lplFue } = await serviceClient
      .from("script_variants")
      .select("id")
      .eq("variant_code", "LPL-FUE")
      .single();

    // A second variant under otherProjectId (a DIFFERENT studio's project,
    // from section 2) — ellie must not be able to touch this one at all.
    const { data: otherScript } = await priya
      .from("scripts")
      .insert({ project_id: otherProjectId, title: "RLS Test — Other Studio Script" })
      .select()
      .single();
    const { data: otherVariant } = await priya
      .from("script_variants")
      .insert({ script_id: otherScript.id, variant_code: "RLS-AUDIO-TEST" })
      .select()
      .single();

    // -- DB-level: audio_items insert gating -----------------------------
    const { data: ellieItem, error: ellieItemErr } = await ellie
      .from("audio_items")
      .insert({ script_variant_id: lplFue.id })
      .select()
      .single();
    check("studio_contributor CAN create an audio_item for their own studio's project", !ellieItemErr && !!ellieItem);

    const { error: ellieOtherErr } = await ellie
      .from("audio_items")
      .insert({ script_variant_id: otherVariant.id })
      .select();
    check(
      "studio_contributor CANNOT create an audio_item for a DIFFERENT studio's project",
      !!ellieOtherErr,
    );

    const { error: helenItemErr } = await helen
      .from("audio_items")
      .insert({ script_variant_id: otherVariant.id })
      .select();
    check("jet2_reviewer CANNOT create an audio_item anywhere (playback only)", !!helenItemErr);

    // -- create_audio_version RPC, end to end, as the studio uploader ----
    let ellieVersionId;
    if (ellieItem) {
      const path = `${PROJECT.winterSunW1}/${ellieItem.id}/rls-test-${RUN_SUFFIX}.wav`;
      const { error: uploadErr } = await ellie.storage
        .from("audio-recordings")
        .upload(path, new Blob([new Uint8Array([0, 1, 2, 3])]), { contentType: "audio/wav" });
      check("studio_contributor CAN upload bytes to their own studio's project path", !uploadErr);

      const { data: rpcVersionId, error: rpcErr } = await ellie.rpc("create_audio_version", {
        p_audio_item_id: ellieItem.id,
        p_original_filename: "rls-test.wav",
        p_storage_path: path,
        p_file_size_bytes: 4,
        p_file_checksum: "test-checksum",
        p_duration_seconds: 1,
        p_codec: "pcm_s16le",
        p_sample_rate_hz: 8000,
        p_channels: 1,
        p_bit_rate_bps: 128000,
        p_container_format: "wav",
        p_waveform_peaks: [0.1, 0.2],
      });
      check("studio_contributor CAN call create_audio_version for their own project", !rpcErr && !!rpcVersionId);
      ellieVersionId = rpcVersionId;

      const { data: itemAfter } = await serviceClient
        .from("audio_items")
        .select("current_version_id")
        .eq("id", ellieItem.id)
        .single();
      check(
        "create_audio_version correctly repointed current_version_id",
        itemAfter?.current_version_id === ellieVersionId,
      );
    }

    // -- Storage RLS: upload vs playback-only -----------------------------
    const otherPath = `${otherProjectId}/${otherVariant.id}/rls-test-${RUN_SUFFIX}.wav`;
    const { error: ellieOtherUploadErr } = await ellie.storage
      .from("audio-recordings")
      .upload(otherPath, new Blob([new Uint8Array([0, 1])]), { contentType: "audio/wav" });
    check(
      "studio_contributor CANNOT upload to a DIFFERENT studio's project path",
      !!ellieOtherUploadErr,
    );

    const helenUploadPath = `${PROJECT.winterSunW1}/${ellieItem?.id ?? "x"}/helen-should-fail-${RUN_SUFFIX}.wav`;
    const { error: helenUploadErr } = await helen.storage
      .from("audio-recordings")
      .upload(helenUploadPath, new Blob([new Uint8Array([0, 1])]), { contentType: "audio/wav" });
    check("jet2_reviewer CANNOT upload audio anywhere (playback only)", !!helenUploadErr);

    if (ellieItem) {
      const { data: signed, error: signedErr } = await helen.storage
        .from("audio-recordings")
        .createSignedUrl(`${PROJECT.winterSunW1}/${ellieItem.id}/rls-test-${RUN_SUFFIX}.wav`, 60);
      check(
        "jet2_reviewer CAN get a signed playback URL for a project they can access",
        !signedErr && !!signed?.signedUrl,
      );

      const { data: helenSelect } = await helen
        .from("audio_versions")
        .select("id")
        .eq("id", ellieVersionId)
        .maybeSingle();
      check("jet2_reviewer CAN read the audio_versions row via the DB too", !!helenSelect);
    }

    // -- Immutability: no UPDATE on audio_versions, for anyone -----------
    if (ellieVersionId) {
      const { error: updateErr } = await priya
        .from("audio_versions")
        .update({ original_filename: "tampered.wav" })
        .eq("id", ellieVersionId);
      check(
        "audio_versions CANNOT be updated by anyone, even ima_admin (immutable, no UPDATE grant/policy)",
        !!updateErr,
      );
    }

    // -- Activity logging --------------------------------------------------
    if (ellieVersionId) {
      const { data: activity } = await serviceClient
        .from("activity_events")
        .select("action")
        .eq("action", "audio_uploaded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("create_audio_version logs an audio_uploaded activity event", activity?.action === "audio_uploaded");
    }

    // Unlike a project, audio_items/audio_versions have no activity-logging
    // trigger of their own (activity_events references project_id, not
    // audio_item_id), so this cleanup genuinely succeeds — and must run:
    // audio_items has unique(script_variant_id), so a second run against
    // this same real LPL-FUE variant would otherwise fail on that
    // constraint, not the RLS check the next run is actually trying to prove.
    if (ellieItem) await serviceClient.from("audio_items").delete().eq("id", ellieItem.id);
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
