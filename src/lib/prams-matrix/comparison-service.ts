/**
 * Structural comparison between two PRAMS updates (two `projects` rows of
 * type `prams`). Backend/service-layer only for Phase 2B, with a minimal
 * read-only frontend page — see docs/phase-2b-import.md. Read-only
 * throughout; nothing here writes.
 *
 * Matching is by global announcement identity (`prams_announcements.id`,
 * via each project's `prams_announcement_versions.announcement_id`) for
 * announcements, and by `(section.slug, row.row_key)` for rows — both
 * stable across updates by design (see the Phase 2B schema docs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

interface AnnouncementSnapshot {
  announcementId: string;
  referenceCode: string;
  title: string;
  sectionSlug: string | null;
  status: string;
}

interface RowGroupSnapshot {
  referenceCodes: Set<string>;
  text: string | null;
}

export interface ComparisonResult {
  unchanged: string[];
  added: { referenceCode: string; title: string }[];
  removed: { referenceCode: string; title: string }[];
  titleChanged: { referenceCode: string; before: string; after: string }[];
  sectionMoved: { referenceCode: string; before: string | null; after: string | null }[];
  wordingChanged: { sectionSlug: string; rowKey: string; referenceCodes: string[]; before: string | null; after: string | null }[];
  sharingChanged: { sectionSlug: string; rowKey: string; before: string[][]; after: string[][] }[];
}

async function snapshotAnnouncements(supabase: Client, projectId: string): Promise<Map<string, AnnouncementSnapshot>> {
  const { data, error } = await supabase
    .from("prams_announcement_versions")
    .select("*, announcement:prams_announcements(*), section:prams_sections(slug)")
    .eq("project_id", projectId);
  if (error) throw error;

  const byAnnouncementId = new Map<string, AnnouncementSnapshot>();
  for (const v of data ?? []) {
    if (!v.announcement) continue;
    byAnnouncementId.set(v.announcement_id, {
      announcementId: v.announcement_id,
      referenceCode: v.announcement.reference_code,
      title: v.title_at_import,
      sectionSlug: v.section?.slug ?? null,
      status: v.status,
    });
  }
  return byAnnouncementId;
}

async function snapshotRowGroups(
  supabase: Client,
  projectId: string,
): Promise<Map<string, RowGroupSnapshot[]>> {
  const { data: sections } = await supabase.from("prams_sections").select("id, slug").eq("project_id", projectId);
  const result = new Map<string, RowGroupSnapshot[]>();

  for (const section of sections ?? []) {
    const { data: rows } = await supabase
      .from("prams_matrix_rows")
      .select("id, row_key")
      .eq("section_id", section.id)
      .eq("status", "active");

    for (const row of rows ?? []) {
      const { data: cells } = await supabase
        .from("prams_matrix_cells")
        .select("id, announcement_version_id")
        .eq("row_id", row.id);
      if (!cells || cells.length === 0) continue;

      const { data: versions } = await supabase
        .from("prams_announcement_versions")
        .select("id, announcement:prams_announcements(reference_code)")
        .in(
          "id",
          cells.map((c) => c.announcement_version_id),
        );

      const { data: members } = await supabase
        .from("prams_wording_group_members")
        .select("wording_group_id, matrix_cell_id, wording_group:prams_wording_groups(text)")
        .in(
          "matrix_cell_id",
          cells.map((c) => c.id),
        )
        .eq("is_current", true);

      const byGroup = new Map<string, RowGroupSnapshot>();
      for (const m of members ?? []) {
        const cell = cells.find((c) => c.id === m.matrix_cell_id);
        const version = versions?.find((v) => v.id === cell?.announcement_version_id);
        const refCode = version?.announcement?.reference_code;
        if (!refCode) continue;
        const text = (m.wording_group as unknown as { text: string | null })?.text ?? null;
        const existing = byGroup.get(m.wording_group_id);
        if (existing) existing.referenceCodes.add(refCode);
        else byGroup.set(m.wording_group_id, { referenceCodes: new Set([refCode]), text });
      }

      result.set(`${section.slug}::${row.row_key}`, Array.from(byGroup.values()));
    }
  }
  return result;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export async function compareUpdates(supabase: Client, projectAId: string, projectBId: string): Promise<ComparisonResult> {
  const [snapA, snapB, rowsA, rowsB] = await Promise.all([
    snapshotAnnouncements(supabase, projectAId),
    snapshotAnnouncements(supabase, projectBId),
    snapshotRowGroups(supabase, projectAId),
    snapshotRowGroups(supabase, projectBId),
  ]);

  const result: ComparisonResult = {
    unchanged: [],
    added: [],
    removed: [],
    titleChanged: [],
    sectionMoved: [],
    wordingChanged: [],
    sharingChanged: [],
  };

  for (const [id, a] of snapA) {
    const b = snapB.get(id);
    if (!b || b.status !== "active") {
      if (a.status === "active") result.removed.push({ referenceCode: a.referenceCode, title: a.title });
      continue;
    }
    if (a.status !== "active") continue;

    let changed = false;
    if (a.title !== b.title) {
      result.titleChanged.push({ referenceCode: a.referenceCode, before: a.title, after: b.title });
      changed = true;
    }
    if (a.sectionSlug !== b.sectionSlug) {
      result.sectionMoved.push({ referenceCode: a.referenceCode, before: a.sectionSlug, after: b.sectionSlug });
      changed = true;
    }
    if (!changed) result.unchanged.push(a.referenceCode);
  }

  for (const [id, b] of snapB) {
    if (b.status !== "active") continue;
    const a = snapA.get(id);
    if (!a || a.status !== "active") result.added.push({ referenceCode: b.referenceCode, title: b.title });
  }

  const allRowKeys = new Set([...rowsA.keys(), ...rowsB.keys()]);
  for (const key of allRowKeys) {
    const [sectionSlug, rowKey] = key.split("::");
    const groupsA = rowsA.get(key) ?? [];
    const groupsB = rowsB.get(key) ?? [];

    for (const gb of groupsB) {
      const match = groupsA.find((ga) => sameSet(ga.referenceCodes, gb.referenceCodes));
      if (match) {
        if (match.text !== gb.text) {
          result.wordingChanged.push({
            sectionSlug,
            rowKey,
            referenceCodes: Array.from(gb.referenceCodes),
            before: match.text,
            after: gb.text,
          });
        }
      } else if (groupsA.length > 0) {
        result.sharingChanged.push({
          sectionSlug,
          rowKey,
          before: groupsA.map((g) => Array.from(g.referenceCodes)),
          after: groupsB.map((g) => Array.from(g.referenceCodes)),
        });
      }
    }
  }

  return result;
}
