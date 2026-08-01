"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseWorkbook, type ParsedSection } from "./parser";
import { confirmImport, createImportRecord, discardImport, persistDiffs, previewImport, type ImportDiff } from "./import-service";
import type { Json } from "@/lib/supabase/database.types";
import ExcelJS from "exceljs";

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
    throw new Error("Only an IMA Admin or Producer can import a PRAMS workbook.");
  }

  const { data: project } = await supabase.from("projects").select("id, type").eq("id", projectId).maybeSingle();
  if (!project || project.type !== "prams") throw new Error("Not a PRAMS project.");

  return { supabase, profile };
}

export interface PreviewImportState {
  error?: string;
  result?: {
    importId: string;
    sectionSlug: string;
    diffs: ImportDiff[];
    sectionIsNew: boolean;
  };
}

export async function previewWorkbookImport(
  _prevState: PreviewImportState,
  formData: FormData,
): Promise<PreviewImportState> {
  const projectId = String(formData.get("projectId") ?? "");
  const sheetName = String(formData.get("sheetName") ?? "").trim();
  const sectionSlug = String(formData.get("sectionSlug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const file = formData.get("file");

  if (!projectId || !sheetName || !sectionSlug) {
    return { error: "Pick a file, sheet name, and section." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .xlsx workbook file." };
  }

  let supabase, profile;
  try {
    ({ supabase, profile } = await assertProjectManager(projectId));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseWorkbook(buffer, [sheetName]);
  } catch {
    // Give back the sheet names actually in the file rather than a raw parser error.
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const names = workbook.worksheets.map((w) => w.name).join(", ");
      return { error: `Sheet "${sheetName}" wasn't found. Sheets in this file: ${names || "(none)"}.` };
    } catch {
      return { error: "Couldn't read that file — make sure it's a valid .xlsx workbook." };
    }
  }

  const parsedSection = parsed.sections[0];

  let preview;
  try {
    preview = await previewImport(supabase, projectId, sectionSlug, parsedSection);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't compare this workbook to the current structure." };
  }

  if (preview.diffs.length === 0) {
    return { error: "No changes detected — this section already matches the workbook." };
  }

  const importRecord = await createImportRecord(supabase, projectId, file.name, null, profile.id);
  await supabase
    .from("prams_workbook_imports")
    .update({ summary: { sectionSlug, sheetName, parsedSection } as unknown as Json })
    .eq("id", importRecord.id);
  await persistDiffs(supabase, importRecord.id, preview.diffs);

  return {
    result: {
      importId: importRecord.id,
      sectionSlug,
      diffs: preview.diffs,
      sectionIsNew: preview.sectionIsNew,
    },
  };
}

export interface ConfirmImportState {
  error?: string;
  confirmed?: boolean;
}

export async function confirmWorkbookImport(
  _prevState: ConfirmImportState,
  formData: FormData,
): Promise<ConfirmImportState> {
  const importId = String(formData.get("importId") ?? "");
  if (!importId) return { error: "Missing import." };

  const supabase = await createClient();
  const { data: importRow, error } = await supabase
    .from("prams_workbook_imports")
    .select("id, project_id, summary, status")
    .eq("id", importId)
    .maybeSingle();
  if (error || !importRow) return { error: "Import not found." };
  if (importRow.status !== "pending_review") return { error: "This import has already been confirmed or discarded." };

  let profile;
  try {
    ({ profile } = await assertProjectManager(importRow.project_id));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }

  const summary = importRow.summary as unknown as {
    sectionSlug: string;
    sheetName: string;
    parsedSection: ParsedSection;
  };
  const { data: diffRows } = await supabase
    .from("prams_workbook_import_diffs")
    .select("row_key")
    .eq("import_id", importId);
  const changedRowKeys = new Set((diffRows ?? []).map((d) => d.row_key).filter((k): k is string => !!k));

  try {
    await confirmImport(
      supabase,
      importRow.project_id,
      summary.sectionSlug,
      summary.parsedSection,
      importId,
      changedRowKeys,
      profile.id,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't apply this import." };
  }

  revalidatePath(`/projects/${importRow.project_id}`);
  revalidatePath("/prams-registry");
  return { confirmed: true };
}

export async function discardWorkbookImport(importId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: importRow } = await supabase
    .from("prams_workbook_imports")
    .select("id, project_id, status")
    .eq("id", importId)
    .maybeSingle();
  if (!importRow) return { error: "Import not found." };
  if (importRow.status !== "pending_review") return { error: "This import has already been confirmed or discarded." };

  try {
    await assertProjectManager(importRow.project_id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }

  await discardImport(supabase, importId);
  return {};
}
