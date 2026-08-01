"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSection, parseVerticalBlocks, type ParsedSection } from "./parser";
import {
  confirmImport,
  createImportRecord,
  discardImport,
  findDuplicateReferenceCodes,
  persistDiffs,
  previewImport,
  type ImportDiff,
} from "./import-service";
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

async function loadWorkbook(file: File): Promise<ExcelJS.Workbook> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "section";
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Matches a parsed section to an existing prams_sections row by slug, then by name, before falling back to a fresh slug. */
async function resolveSectionSlug(supabase: Client, projectId: string, sectionTitle: string): Promise<string> {
  const candidate = slugify(sectionTitle);
  const { data: bySlug } = await supabase
    .from("prams_sections")
    .select("slug")
    .eq("project_id", projectId)
    .eq("slug", candidate)
    .maybeSingle();
  if (bySlug) return bySlug.slug;

  const { data: byName } = await supabase
    .from("prams_sections")
    .select("slug")
    .eq("project_id", projectId)
    .ilike("name", sectionTitle)
    .maybeSingle();
  if (byName) return byName.slug;

  return candidate;
}

/** Parses one sheet, trying the side-by-side matrix layout first, then falling back to independent vertically-stacked announcement blocks. */
function parseSheet(worksheet: ExcelJS.Worksheet): ParsedSection[] {
  try {
    return [parseSection(worksheet)];
  } catch {
    const blocks = parseVerticalBlocks(worksheet);
    if (blocks.length === 0) {
      throw new Error(`Couldn't find any recognisable announcement structure in sheet "${worksheet.name}".`);
    }
    return blocks;
  }
}

export interface ListSheetsState {
  error?: string;
  sheetNames?: string[];
}

/** First step of the import wizard — list every tab in the uploaded workbook so the user can pick which become sections. */
export async function listWorkbookSheets(formData: FormData): Promise<ListSheetsState> {
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");

  try {
    await assertProjectManager(projectId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .xlsx workbook file." };
  }

  try {
    const workbook = await loadWorkbook(file);
    const sheetNames = workbook.worksheets.map((w) => w.name);
    if (sheetNames.length === 0) return { error: "This workbook has no sheets." };
    return { sheetNames };
  } catch {
    return { error: "Couldn't read that file — make sure it's a valid .xlsx workbook." };
  }
}

export interface SectionPreviewResult {
  sheetName: string;
  sectionSlug: string;
  sectionTitle: string;
  sectionIsNew: boolean;
  diffs: ImportDiff[];
  error?: string;
}

export interface PreviewMultiImportState {
  error?: string;
  importId?: string;
  results?: SectionPreviewResult[];
}

/**
 * Second step — parses every selected sheet, trying the side-by-side matrix
 * layout first and falling back to independent vertically-stacked
 * announcement blocks (one sheet can therefore yield several sections, or
 * one). Each resulting section is diffed independently against the
 * project's current structure; one sheet or section failing never blocks
 * the others — it's reported back individually instead.
 */
export async function previewMultiSectionImport(formData: FormData): Promise<PreviewMultiImportState> {
  const projectId = String(formData.get("projectId") ?? "");
  const file = formData.get("file");
  const selectedSheetNames = formData.getAll("sheetNames").map(String);

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a .xlsx workbook file." };
  }
  if (selectedSheetNames.length === 0) return { error: "Select at least one sheet to import." };

  let supabase, profile;
  try {
    ({ supabase, profile } = await assertProjectManager(projectId));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not allowed." };
  }

  let workbook: ExcelJS.Workbook;
  try {
    workbook = await loadWorkbook(file);
  } catch {
    return { error: "Couldn't read that file — make sure it's a valid .xlsx workbook." };
  }

  const results: SectionPreviewResult[] = [];
  const toPersist: { sectionSlug: string; sheetName: string; parsedSection: ParsedSection }[] = [];
  const codeOwners = new Map<string, string>(); // normalised code -> "sheetName / sectionSlug" that first claimed it, this batch only

  for (const sheetName of selectedSheetNames) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      results.push({ sheetName, sectionSlug: slugify(sheetName), sectionTitle: sheetName, sectionIsNew: false, diffs: [], error: `Sheet "${sheetName}" not found.` });
      continue;
    }

    let parsedSections: ParsedSection[];
    try {
      parsedSections = parseSheet(worksheet);
    } catch (err) {
      results.push({
        sheetName,
        sectionSlug: slugify(sheetName),
        sectionTitle: sheetName,
        sectionIsNew: false,
        diffs: [],
        error: err instanceof Error ? err.message : "Couldn't parse this sheet.",
      });
      continue;
    }

    for (const parsedSection of parsedSections) {
      const sectionSlug = await resolveSectionSlug(supabase, projectId, parsedSection.sectionTitle);

      const duplicateCodes = findDuplicateReferenceCodes(parsedSection);
      if (duplicateCodes.length > 0) {
        results.push({
          sheetName,
          sectionSlug,
          sectionTitle: parsedSection.sectionTitle,
          sectionIsNew: false,
          diffs: [],
          error: `Two or more columns share the same reference code after normalising (${duplicateCodes.join(", ")}) — fix the workbook so every column's code is unique before importing this section.`,
        });
        continue;
      }

      // reference_code is globally unique — guard against two sections in
      // THIS batch (e.g. two placeholder-coded vertical blocks) silently
      // merging into the same announcement.
      const collidingCode = parsedSection.columns
        .map((c) => c.referenceCodeRaw.trim().toUpperCase())
        .find((code) => codeOwners.has(code) && codeOwners.get(code) !== sectionSlug);
      if (collidingCode) {
        results.push({
          sheetName,
          sectionSlug,
          sectionTitle: parsedSection.sectionTitle,
          sectionIsNew: false,
          diffs: [],
          error: `Reference code "${collidingCode}" is also used by section "${codeOwners.get(collidingCode)}" earlier in this same import — fix one of the two in the workbook before importing either.`,
        });
        continue;
      }
      for (const col of parsedSection.columns) {
        codeOwners.set(col.referenceCodeRaw.trim().toUpperCase(), sectionSlug);
      }

      try {
        const preview = await previewImport(supabase, projectId, sectionSlug, parsedSection);
        results.push({ sheetName, sectionSlug, sectionTitle: parsedSection.sectionTitle, sectionIsNew: preview.sectionIsNew, diffs: preview.diffs });
        if (preview.diffs.length > 0) toPersist.push({ sectionSlug, sheetName, parsedSection });
      } catch (err) {
        results.push({
          sheetName,
          sectionSlug,
          sectionTitle: parsedSection.sectionTitle,
          sectionIsNew: false,
          diffs: [],
          error: err instanceof Error ? err.message : "Couldn't compare this section to the current structure.",
        });
      }
    }
  }

  if (toPersist.length === 0) {
    return { error: "No changes detected in any selected sheet.", results };
  }

  const importRecord = await createImportRecord(supabase, projectId, file.name, null, profile.id);
  await supabase
    .from("prams_workbook_imports")
    .update({ summary: { sections: toPersist } as unknown as Json })
    .eq("id", importRecord.id);
  await persistDiffs(
    supabase,
    importRecord.id,
    results.flatMap((r) => r.diffs),
  );

  return { importId: importRecord.id, results };
}

export interface ConfirmImportState {
  error?: string;
  confirmed?: boolean;
}

export async function confirmMultiSectionImport(importId: string): Promise<ConfirmImportState> {
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
    sections: { sectionSlug: string; sheetName: string; parsedSection: ParsedSection }[];
  };

  for (const { sectionSlug, parsedSection } of summary.sections) {
    const { data: diffRows } = await supabase
      .from("prams_workbook_import_diffs")
      .select("row_key, section_slug")
      .eq("import_id", importId)
      .eq("section_slug", sectionSlug);
    const changedRowKeys = new Set((diffRows ?? []).map((d) => d.row_key).filter((k): k is string => !!k));

    try {
      await confirmImport(supabase, importRow.project_id, sectionSlug, parsedSection, importId, changedRowKeys, profile.id);
    } catch (err) {
      return {
        error: `Applied earlier sections, but section "${sectionSlug}" failed: ${err instanceof Error ? err.message : "unknown error"}. Re-run the import to retry the rest.`,
      };
    }
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
