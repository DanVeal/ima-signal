/**
 * Import preview/commit: turns a ParsedSection (see parser.ts) into a diff
 * against the current database structure, and — on explicit confirmation —
 * applies it. Nothing here ever deletes a script/audio/comment/approval/
 * activity row; a "removed" reference or row is marked as such and kept.
 *
 * Atomicity note: unlike the wording edit/override/re-merge operations
 * (implemented as single Postgres RPC functions and therefore atomic),
 * `commitImport` applies its plan via a sequence of supabase-js calls that
 * is NOT wrapped in one database transaction — supabase-js has no
 * multi-statement transaction API. A failure partway through can leave a
 * partially-applied import. This is a known, documented limitation (see
 * docs/phase-2b-limitations.md), acceptable for Phase 2B because every
 * write here is additive/non-destructive (nothing is deleted, so a retry
 * or manual cleanup is always possible) and because the operation is
 * already gated behind an explicit human preview-then-confirm step, not an
 * automated pipeline.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ParsedAnnouncementColumn, ParsedRow, ParsedSection } from "./parser";

type Client = SupabaseClient<Database>;

export type ImportDiffType =
  | "section_added"
  | "section_changed"
  | "announcement_added"
  | "announcement_removed"
  | "announcement_renamed"
  | "row_added"
  | "row_removed"
  | "row_reordered"
  | "wording_changed"
  | "sharing_changed"
  | "blank_changed";

export interface ImportDiff {
  diffType: ImportDiffType;
  sectionSlug: string;
  rowKey?: string;
  referenceCode?: string;
  payload: Record<string, unknown>;
}

interface CurrentGroup {
  referenceCodes: Set<string>;
  text: string | null;
}

export interface ImportPreview {
  diffs: ImportDiff[];
  sectionIsNew: boolean;
}

export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/** A sheet whose columns normalize to a duplicate code would silently merge distinct announcements under prams_announcements' unique reference_code — refuse rather than corrupt data. */
export function findDuplicateReferenceCodes(parsed: ParsedSection): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const col of parsed.columns) {
    const code = normalizeCode(col.referenceCodeRaw);
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }
  return Array.from(duplicates);
}

/** Reads the section's current structure, if any, in the shape needed for diffing. */
async function readCurrentStructure(supabase: Client, projectId: string, sectionSlug: string) {
  const { data: section } = await supabase
    .from("prams_sections")
    .select("*")
    .eq("project_id", projectId)
    .eq("slug", sectionSlug)
    .maybeSingle();

  if (!section) return { section: null, versions: [], rows: [], rowGroups: new Map<string, CurrentGroup[]>() };

  const { data: versions } = await supabase
    .from("prams_announcement_versions")
    .select("*, announcement:prams_announcements(*)")
    .eq("project_id", projectId)
    .eq("section_id", section.id);

  const { data: rows } = await supabase
    .from("prams_matrix_rows")
    .select("*")
    .eq("section_id", section.id);

  const rowGroups = new Map<string, CurrentGroup[]>();
  for (const row of rows ?? []) {
    const { data: cells } = await supabase
      .from("prams_matrix_cells")
      .select("id, announcement_version_id")
      .eq("row_id", row.id);
    if (!cells || cells.length === 0) continue;

    const cellIds = cells.map((c) => c.id);
    const { data: members } = await supabase
      .from("prams_wording_group_members")
      .select("wording_group_id, matrix_cell_id, wording_group:prams_wording_groups(text)")
      .in("matrix_cell_id", cellIds)
      .eq("is_current", true);

    const byGroup = new Map<string, CurrentGroup>();
    for (const member of members ?? []) {
      const cell = cells.find((c) => c.id === member.matrix_cell_id);
      const version = (versions ?? []).find((v) => v.id === cell?.announcement_version_id);
      const refCode = version?.announcement?.reference_code;
      if (!refCode) continue;
      const existing = byGroup.get(member.wording_group_id);
      const text = (member.wording_group as unknown as { text: string | null })?.text ?? null;
      if (existing) {
        existing.referenceCodes.add(refCode);
      } else {
        byGroup.set(member.wording_group_id, { referenceCodes: new Set([refCode]), text });
      }
    }
    rowGroups.set(row.row_key, Array.from(byGroup.values()));
  }

  return { section, versions: versions ?? [], rows: rows ?? [], rowGroups };
}

function sameRefSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const ref of a) if (!b.has(ref)) return false;
  return true;
}

function parsedRowGroups(row: ParsedRow, columns: ParsedAnnouncementColumn[]): CurrentGroup[] {
  return row.groups.map((g) => ({
    referenceCodes: new Set(
      g.columnIndexes.map((ci) => normalizeCode(columns.find((c) => c.columnIndex === ci)!.referenceCodeRaw)),
    ),
    text: g.text,
  }));
}

export async function previewImport(
  supabase: Client,
  projectId: string,
  sectionSlug: string,
  parsed: ParsedSection,
): Promise<ImportPreview> {
  const current = await readCurrentStructure(supabase, projectId, sectionSlug);
  const diffs: ImportDiff[] = [];
  const sectionIsNew = current.section === null;

  if (sectionIsNew) {
    diffs.push({
      diffType: "section_added",
      sectionSlug,
      payload: { name: parsed.sectionTitle },
    });
  }

  const currentByCode = new Map(
    current.versions.map((v) => [v.announcement?.reference_code ?? "", v] as const),
  );
  const parsedCodes = new Set(parsed.columns.map((c) => normalizeCode(c.referenceCodeRaw)));

  for (const col of parsed.columns) {
    const code = normalizeCode(col.referenceCodeRaw);
    const existing = currentByCode.get(code);
    if (!existing) {
      diffs.push({
        diffType: "announcement_added",
        sectionSlug,
        referenceCode: code,
        payload: { title: col.title, tags: col.tags },
      });
    } else if (existing.title_at_import !== col.title) {
      diffs.push({
        diffType: "announcement_renamed",
        sectionSlug,
        referenceCode: code,
        payload: { before: existing.title_at_import, after: col.title },
      });
    }
  }

  for (const [code, version] of currentByCode) {
    if (version.status === "active" && !parsedCodes.has(code)) {
      diffs.push({
        diffType: "announcement_removed",
        sectionSlug,
        referenceCode: code,
        payload: { title: version.title_at_import },
      });
    }
  }

  const currentRowKeys = new Set(current.rows.map((r) => r.row_key));
  const parsedRowKeys = new Set(parsed.rows.map((r) => `row-${r.rowIndex}`));

  for (const [index, row] of parsed.rows.entries()) {
    const rowKey = `row-${row.rowIndex}`;
    if (!currentRowKeys.has(rowKey)) {
      diffs.push({ diffType: "row_added", sectionSlug, rowKey, payload: {} });
      continue;
    }

    const existingRow = current.rows.find((r) => r.row_key === rowKey);
    if (existingRow && existingRow.sort_order !== index + 1) {
      diffs.push({
        diffType: "row_reordered",
        sectionSlug,
        rowKey,
        payload: { before: existingRow.sort_order, after: index + 1 },
      });
    }

    const oldGroups = current.rowGroups.get(rowKey) ?? [];
    const newGroups = parsedRowGroups(row, parsed.columns);
    if (oldGroups.length === 0) continue; // first time this row has wording (new row path already handled above)

    for (const newGroup of newGroups) {
      const match = oldGroups.find((g) => sameRefSet(g.referenceCodes, newGroup.referenceCodes));
      if (match) {
        if (match.text !== newGroup.text) {
          diffs.push({
            diffType: match.text === null || newGroup.text === null ? "blank_changed" : "wording_changed",
            sectionSlug,
            rowKey,
            payload: {
              referenceCodes: Array.from(newGroup.referenceCodes),
              before: match.text,
              after: newGroup.text,
            },
          });
        }
      } else {
        diffs.push({
          diffType: "sharing_changed",
          sectionSlug,
          rowKey,
          payload: { referenceCodes: Array.from(newGroup.referenceCodes), text: newGroup.text },
        });
      }
    }
  }

  for (const row of current.rows) {
    if (!parsedRowKeys.has(row.row_key) && row.status === "active") {
      diffs.push({ diffType: "row_removed", sectionSlug, rowKey: row.row_key, payload: {} });
    }
  }

  return { diffs, sectionIsNew };
}

export async function createImportRecord(
  supabase: Client,
  projectId: string,
  fileName: string,
  fileHash: string | null,
  actorUserId: string | null,
) {
  const { data, error } = await supabase
    .from("prams_workbook_imports")
    .insert({ project_id: projectId, file_name: fileName, file_hash: fileHash, imported_by_user_id: actorUserId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function persistDiffs(supabase: Client, importId: string, diffs: ImportDiff[]) {
  if (diffs.length === 0) return;
  const { error } = await supabase.from("prams_workbook_import_diffs").insert(
    diffs.map((d) => ({
      import_id: importId,
      diff_type: d.diffType,
      section_slug: d.sectionSlug,
      row_key: d.rowKey ?? null,
      reference_code: d.referenceCode ?? null,
      payload: d.payload as Json,
    })),
  );
  if (error) throw error;
}

export async function discardImport(supabase: Client, importId: string) {
  const { error } = await supabase
    .from("prams_workbook_imports")
    .update({ status: "discarded", completed_at: new Date().toISOString() })
    .eq("id", importId);
  if (error) throw error;
}

/**
 * Applies a previously-previewed import. Non-destructive throughout: a
 * removed reference/row is marked `status = 'removed'`, never deleted; a
 * row whose wording changed gets fresh wording_groups/memberships, while
 * its previous ones are retired (is_current = false) but kept. Only rows
 * actually named in `changedRowKeys` (from the preview diff) get their
 * wording regenerated — an unflagged existing row is left untouched.
 */
export async function confirmImport(
  supabase: Client,
  projectId: string,
  sectionSlug: string,
  parsed: ParsedSection,
  importId: string,
  changedRowKeys: Set<string>,
  actorUserId: string | null,
) {
  const { data: existingSection } = await supabase
    .from("prams_sections")
    .select("*")
    .eq("project_id", projectId)
    .eq("slug", sectionSlug)
    .maybeSingle();

  const section = existingSection
    ? (
        await supabase
          .from("prams_sections")
          .update({ source_import_id: importId })
          .eq("id", existingSection.id)
          .select()
          .single()
      ).data!
    : (
        await supabase
          .from("prams_sections")
          .insert({
            project_id: projectId,
            slug: sectionSlug,
            name: parsed.sectionTitle,
            sort_order: 1,
            available: true,
            source_import_id: importId,
          })
          .select()
          .single()
      ).data!;

  const versionByCode = new Map<string, { id: string }>();
  const parsedCodes = new Set<string>();

  for (const col of parsed.columns) {
    const code = normalizeCode(col.referenceCodeRaw);
    parsedCodes.add(code);
    const rawDiffers = col.referenceCodeRaw !== code;

    let { data: announcement } = await supabase
      .from("prams_announcements")
      .select("*")
      .eq("reference_code", code)
      .maybeSingle();

    if (!announcement) {
      const inserted = await supabase
        .from("prams_announcements")
        .insert({ reference_code: col.referenceCodeRaw, current_title: col.title, current_tags: col.tags })
        .select()
        .single();
      if (inserted.error) throw inserted.error;
      announcement = inserted.data;
    } else if (announcement.current_title !== col.title) {
      const updated = await supabase
        .from("prams_announcements")
        .update({ current_title: col.title, current_tags: col.tags })
        .eq("id", announcement.id)
        .select()
        .single();
      if (updated.error) throw updated.error;
      announcement = updated.data;
    }

    const { data: existingVersion } = await supabase
      .from("prams_announcement_versions")
      .select("*")
      .eq("project_id", projectId)
      .eq("announcement_id", announcement.id)
      .maybeSingle();

    if (existingVersion) {
      const { data: updatedVersion, error } = await supabase
        .from("prams_announcement_versions")
        .update({
          section_id: section.id,
          title_at_import: col.title,
          tags: col.tags,
          column_order: col.columnIndex,
          status: "active",
          source_import_id: importId,
          reference_code_raw: rawDiffers ? col.referenceCodeRaw : null,
        })
        .eq("id", existingVersion.id)
        .select()
        .single();
      if (error) throw error;
      versionByCode.set(code, updatedVersion);
    } else {
      const { data: newVersion, error } = await supabase
        .from("prams_announcement_versions")
        .insert({
          announcement_id: announcement.id,
          project_id: projectId,
          section_id: section.id,
          title_at_import: col.title,
          tags: col.tags,
          column_order: col.columnIndex,
          status: "active",
          source_import_id: importId,
          reference_code_raw: rawDiffers ? col.referenceCodeRaw : null,
        })
        .select()
        .single();
      if (error) throw error;
      versionByCode.set(code, newVersion);
    }
  }

  // Anything previously active in this section but absent from this import is removed — never deleted.
  const { data: allVersionsInSection } = await supabase
    .from("prams_announcement_versions")
    .select("*, announcement:prams_announcements(reference_code)")
    .eq("project_id", projectId)
    .eq("section_id", section.id);
  for (const v of allVersionsInSection ?? []) {
    const code = v.announcement?.reference_code;
    if (code && !parsedCodes.has(code) && v.status === "active") {
      await supabase
        .from("prams_announcement_versions")
        .update({ status: "removed", source_import_id: importId })
        .eq("id", v.id);
    }
  }

  for (const [index, row] of parsed.rows.entries()) {
    const rowKey = `row-${row.rowIndex}`;
    const { data: existingRow } = await supabase
      .from("prams_matrix_rows")
      .select("*")
      .eq("section_id", section.id)
      .eq("row_key", rowKey)
      .maybeSingle();

    const matrixRow = existingRow
      ? (
          await supabase
            .from("prams_matrix_rows")
            .update({ sort_order: index + 1, source_import_id: importId })
            .eq("id", existingRow.id)
            .select()
            .single()
        ).data!
      : (
          await supabase
            .from("prams_matrix_rows")
            .insert({
              section_id: section.id,
              row_key: rowKey,
              sort_order: index + 1,
              source_import_id: importId,
            })
            .select()
            .single()
        ).data!;

    // Ensure every (row, active announcement_version) coordinate has a cell.
    const cellByCode = new Map<string, string>();
    for (const col of parsed.columns) {
      const code = normalizeCode(col.referenceCodeRaw);
      const version = versionByCode.get(code)!;
      const { data: existingCell } = await supabase
        .from("prams_matrix_cells")
        .select("id")
        .eq("row_id", matrixRow.id)
        .eq("announcement_version_id", version.id)
        .maybeSingle();
      const cell =
        existingCell ??
        (
          await supabase
            .from("prams_matrix_cells")
            .insert({ row_id: matrixRow.id, announcement_version_id: version.id, source_import_id: importId })
            .select("id")
            .single()
        ).data!;
      cellByCode.set(code, cell.id);
    }

    if (!existingRow || changedRowKeys.has(rowKey)) {
      // Retire whatever's currently assigned to this row's cells, then lay
      // down fresh groups reflecting the newly-parsed grouping.
      const cellIds = Array.from(cellByCode.values());
      const { data: currentMemberships } = await supabase
        .from("prams_wording_group_members")
        .select("id, matrix_cell_id")
        .in("matrix_cell_id", cellIds)
        .eq("is_current", true);
      const oldMembershipByCellId = new Map((currentMemberships ?? []).map((m) => [m.matrix_cell_id, m.id]));
      for (const m of currentMemberships ?? []) {
        await supabase.from("prams_wording_group_members").update({ is_current: false }).eq("id", m.id);
      }

      for (const group of row.groups) {
        const { data: newGroup, error } = await supabase
          .from("prams_wording_groups")
          .insert({
            row_id: matrixRow.id,
            text: group.text,
            source: "workbook_import",
            created_by_user_id: actorUserId,
            source_import_id: importId,
          })
          .select()
          .single();
        if (error) throw error;

        for (const columnIndex of group.columnIndexes) {
          const col = parsed.columns.find((c) => c.columnIndex === columnIndex);
          if (!col) continue;
          const code = normalizeCode(col.referenceCodeRaw);
          const cellId = cellByCode.get(code);
          if (!cellId) continue;
          await supabase.from("prams_wording_group_members").insert({
            wording_group_id: newGroup.id,
            matrix_cell_id: cellId,
            is_current: true,
            replaces_membership_id: oldMembershipByCellId.get(cellId) ?? null,
          });
        }
      }
    }
  }

  // Rows that existed before but aren't in this import are marked removed, never deleted.
  const { data: allRowsInSection } = await supabase
    .from("prams_matrix_rows")
    .select("*")
    .eq("section_id", section.id);
  const parsedRowKeys = new Set(parsed.rows.map((r) => `row-${r.rowIndex}`));
  for (const r of allRowsInSection ?? []) {
    if (!parsedRowKeys.has(r.row_key) && r.status === "active") {
      await supabase.from("prams_matrix_rows").update({ status: "removed" }).eq("id", r.id);
    }
  }

  await supabase
    .from("prams_workbook_imports")
    .update({ status: "confirmed", completed_at: new Date().toISOString() })
    .eq("id", importId);

  await supabase.from("activity_events").insert({
    actor_user_id: actorUserId,
    project_id: projectId,
    entity_type: "prams_workbook_import",
    entity_label: `${sectionSlug} (${parsed.sheetName})`,
    action: "import_committed",
    metadata: { import_id: importId, section_slug: sectionSlug },
  });
}
