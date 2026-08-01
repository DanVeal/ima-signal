"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CreateScriptState {
  error?: string;
}

interface ParsedAlt {
  label: string;
  body: string;
}

function parseAlts(raw: string): ParsedAlt[] {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .map((v) => ({ label: String(v?.label ?? "").trim(), body: String(v?.body ?? "").trim() }))
      .filter((alt) => alt.label && alt.body);
  } catch {
    return [];
  }
}

async function assertProjectManager(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile || (profile.role !== "ima_admin" && profile.role !== "ima_producer")) {
    throw new Error("Only an IMA Admin or Producer can author a script.");
  }

  const { data: project } = await supabase.from("projects").select("id, type").eq("id", projectId).maybeSingle();
  if (!project || project.type !== "standard_radio") throw new Error("Not a Standard Radio project.");

  return { supabase, profile };
}

export async function createScript(_prevState: CreateScriptState, formData: FormData): Promise<CreateScriptState> {
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  const variantCodes = formData.getAll("variantCode").map((v) => String(v).trim());
  const destinations = formData.getAll("destination").map((v) => String(v).trim());
  const departureAirports = formData.getAll("departureAirport").map((v) => String(v).trim());
  const offerLabels = formData.getAll("offerLabel").map((v) => String(v).trim());
  const regionLabels = formData.getAll("regionLabel").map((v) => String(v).trim());
  const lineBlocks = formData.getAll("lines").map((v) => String(v));
  const anchorLines = formData.getAll("anchorLine").map((v) => String(v).trim());
  const altBlocks = formData.getAll("alts").map((v) => String(v));

  if (!projectId || !title) return { error: "Give the script a title." };
  if (variantCodes.length === 0 || variantCodes.every((c) => !c)) {
    return { error: "Add at least one variant with a variant code." };
  }

  let assertResult: Awaited<ReturnType<typeof assertProjectManager>>;
  try {
    assertResult = await assertProjectManager(projectId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }
  const { supabase, profile } = assertResult;

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .insert({ project_id: projectId, title })
    .select("id")
    .single();
  if (scriptError || !script) return { error: "Couldn't create the script." };

  const scriptId = script.id;
  async function failAndCleanUp(error: string): Promise<CreateScriptState> {
    // Nothing kept half-created — script_variants/revisions/lines/alts all cascade off scripts.id.
    await supabase.from("scripts").delete().eq("id", scriptId);
    return { error };
  }

  for (let i = 0; i < variantCodes.length; i++) {
    const variantCode = variantCodes[i];
    if (!variantCode) continue;

    const lines = (lineBlocks[i] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return failAndCleanUp(`Add at least one line for variant "${variantCode}".`);
    }

    const alts = parseAlts(altBlocks[i] ?? "[]");
    let anchorLineSortOrder: number | null = null;
    if (alts.length > 0) {
      const anchor = Number(anchorLines[i]);
      if (!Number.isInteger(anchor) || anchor < 1 || anchor > lines.length) {
        return failAndCleanUp(
          `Variant "${variantCode}" has alternate lines but no valid anchor line (pick a line number between 1 and ${lines.length}).`,
        );
      }
      anchorLineSortOrder = anchor;
    }

    const { data: variant, error: variantError } = await supabase
      .from("script_variants")
      .insert({
        script_id: scriptId,
        variant_code: variantCode,
        destination: destinations[i] || null,
        departure_airport: departureAirports[i] || null,
        offer_label: offerLabels[i] || null,
        region_label: regionLabels[i] || null,
        column_order: i + 1,
      })
      .select("id")
      .single();
    if (variantError || !variant) {
      return failAndCleanUp(
        variantError?.code === "23505" ? `Variant code "${variantCode}" is already used in this script.` : "Couldn't create a variant.",
      );
    }

    const { data: revision, error: revisionError } = await supabase
      .from("script_revisions")
      .insert({
        variant_id: variant.id,
        revision_number: 1,
        created_by_user_id: profile.id,
        anchor_line_sort_order: anchorLineSortOrder,
      })
      .select("id")
      .single();
    if (revisionError || !revision) return failAndCleanUp("Couldn't create the initial revision.");

    const { error: linesError } = await supabase.from("script_lines").insert(
      lines.map((text, lineIndex) => ({ revision_id: revision.id, sort_order: lineIndex + 1, text })),
    );
    if (linesError) return failAndCleanUp("Couldn't save the script lines.");

    if (alts.length > 0) {
      const { error: altsError } = await supabase.from("script_alts").insert(
        alts.map((alt, altIndex) => ({
          revision_id: revision.id,
          label: alt.label,
          body: alt.body,
          sort_order: altIndex + 1,
        })),
      );
      if (altsError) return failAndCleanUp("Couldn't save the alternate lines.");
    }
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
