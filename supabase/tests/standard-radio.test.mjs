// Phase 2B — Standard Radio tests: script -> variant -> revision -> ordered
// lines, immutability of revisions, and "every change creates a new
// revision" (never overwrite historical wording). Uses a throwaway script
// under the real seeded Standard Radio project so the real Winter Sun
// seed data is left untouched. Run via: node --env-file=.env.local supabase/tests/standard-radio.test.mjs
import { serviceClient, signInAs, check, summarize } from "./helpers.mjs";

const STANDARD_RADIO_PROJECT_ID = "00000000-0000-0000-0000-000000000501";
const IMA_PRODUCER_PROFILE_ID = "00000000-0000-0000-0000-000000000302";

console.log("\n=== Standard Radio: script -> variant -> revision -> ordered lines ===");

const { data: script, error: scriptError } = await serviceClient
  .from("scripts")
  .insert({ project_id: STANDARD_RADIO_PROJECT_ID, title: "Test Script" })
  .select()
  .single();
check("creates a script under the Standard Radio project", !scriptError && !!script);

const { data: variant, error: variantError } = await serviceClient
  .from("script_variants")
  .insert({ script_id: script.id, variant_code: "TEST-VARIANT", destination: "Testville", column_order: 1 })
  .select()
  .single();
check("creates a script variant", !variantError && !!variant);

const { data: revision1, error: revision1Error } = await serviceClient
  .from("script_revisions")
  .insert({ variant_id: variant.id, revision_number: 1, created_by_user_id: IMA_PRODUCER_PROFILE_ID })
  .select()
  .single();
check("creates revision 1", !revision1Error && !!revision1);

const linesR1 = ["Line one.", "Line two.", "Line three."];
for (const [i, text] of linesR1.entries()) {
  const { error } = await serviceClient
    .from("script_lines")
    .insert({ revision_id: revision1.id, sort_order: i + 1, text });
  if (error) throw error;
}

const { data: fetchedLinesR1 } = await serviceClient
  .from("script_lines")
  .select("*")
  .eq("revision_id", revision1.id)
  .order("sort_order");
check(
  "revision 1's lines are persisted in order",
  fetchedLinesR1.map((l) => l.text).join("|") === linesR1.join("|"),
);

console.log("\n=== A wording change creates a NEW revision, never overwrites the old one ===");

const { data: revision2, error: revision2Error } = await serviceClient
  .from("script_revisions")
  .insert({ variant_id: variant.id, revision_number: 2, created_by_user_id: IMA_PRODUCER_PROFILE_ID, notes: "Revised wording" })
  .select()
  .single();
check("creates revision 2 (a distinct row, not an update to revision 1)", !revision2Error && revision2.id !== revision1.id);

const linesR2 = ["Revised line one.", "Revised line two."];
for (const [i, text] of linesR2.entries()) {
  const { error } = await serviceClient
    .from("script_lines")
    .insert({ revision_id: revision2.id, sort_order: i + 1, text });
  if (error) throw error;
}

const { data: fetchedLinesR1Again } = await serviceClient
  .from("script_lines")
  .select("*")
  .eq("revision_id", revision1.id)
  .order("sort_order");
check(
  "revision 1's original lines are UNCHANGED after revision 2 is created",
  fetchedLinesR1Again.map((l) => l.text).join("|") === linesR1.join("|"),
);

const { data: bothRevisions } = await serviceClient
  .from("script_revisions")
  .select("*")
  .eq("variant_id", variant.id)
  .order("revision_number");
check("both revisions coexist for the same variant (full history retained)", bothRevisions.length === 2);

console.log("\n=== Revision immutability is enforced at the database level ===");

// service_role bypasses RLS entirely (rolbypassrls), so the real proof needs
// an authenticated client — even ima_admin, who can write everything else in
// this schema, has no UPDATE policy at all on script_revisions/script_lines.
const imaAdmin = await signInAs("priya.anand@ima.global");

const { error: updateAttemptError } = await imaAdmin
  .from("script_revisions")
  .update({ notes: "Trying to mutate history" })
  .eq("id", revision1.id);
check(
  "ima_admin attempting to UPDATE an existing revision is rejected (no UPDATE policy exists for it)",
  !!updateAttemptError,
);

const { data: revision1Unchanged } = await serviceClient
  .from("script_revisions")
  .select("notes")
  .eq("id", revision1.id)
  .single();
check("revision 1's row is confirmed unchanged after the rejected update attempt", revision1Unchanged.notes === null);

const { error: lineUpdateAttemptError } = await imaAdmin
  .from("script_lines")
  .update({ text: "Trying to mutate a historical line" })
  .eq("revision_id", revision1.id)
  .eq("sort_order", 1);
check(
  "ima_admin attempting to UPDATE a historical script_line is also rejected",
  !!lineUpdateAttemptError,
);

console.log("\n=== Approval marks a revision without touching its wording ===");

const { data: approvedRevision, error: approveError } = await serviceClient
  .from("script_revisions")
  .insert({
    variant_id: variant.id,
    revision_number: 3,
    is_approved_for_recording: true,
    approved_by_user_id: IMA_PRODUCER_PROFILE_ID,
    approved_at: new Date(0).toISOString(),
    created_by_user_id: IMA_PRODUCER_PROFILE_ID,
  })
  .select()
  .single();
check("a revision can be authored as approved-for-recording at creation time", !approveError && approvedRevision.is_approved_for_recording === true);

// cleanup: throwaway script only — cascades variant/revisions/lines. Real
// seeded Winter Sun script/variants/revisions/lines are untouched throughout.
await serviceClient.from("scripts").delete().eq("id", script.id);

summarize();
