/**
 * Repository/service layer — thin, typed wrappers over the tables that
 * exist so far. Every function takes a Supabase client so callers control
 * which identity the query runs as (browser/session, server/session, or
 * service-role) — RLS enforces the rest.
 *
 * Phase 2A covered organisations, users, campaigns, projects, and the PRAMS
 * update/registry/section tables. Phase 2B adds Standard Radio scripts and
 * the PRAMS matrix/wording tables (below) — but the mock-driven project
 * pages (Boarding matrix, announcement-variant review, bulk import) still
 * read src/lib/mock/, not these functions; see docs/phase-2b-limitations.md
 * for why full frontend replacement is out of this round's scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

export async function getCurrentUserProfile(supabase: Client) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*, organisation:organisations(*)")
    .eq("auth_user_id", user.id)
    .single();
  if (error) return null;
  return data;
}

export async function getOrganisations(supabase: Client) {
  const { data, error } = await supabase.from("organisations").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function getOrganisation(supabase: Client, id: string) {
  const { data, error } = await supabase.from("organisations").select("*").eq("id", id).single();
  if (error) return null;
  return data;
}

export async function getCampaign(supabase: Client, id: string) {
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).single();
  if (error) return null;
  return data;
}

/**
 * All projects visible to the caller under RLS — not scoped by organisation
 * here; RLS already is. Ordered oldest-first: the /prams-registry and
 * /scripts-registry proof pages pick "the" project of a given type via
 * .find(), and once a project logs even one activity_events row it can
 * never be deleted (append-only is enforced even for service_role — see
 * docs/phase-2b-limitations.md), so any project created by a test run
 * afterwards must never be able to shadow the real seeded one.
 */
export async function getProjects(supabase: Client) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function getProjectById(supabase: Client, id: string) {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
  if (error) return null;
  return data;
}

export async function getPramsUpdate(supabase: Client, projectId: string) {
  const { data, error } = await supabase
    .from("prams_updates")
    .select("*")
    .eq("project_id", projectId)
    .single();
  if (error) return null;
  return data;
}

export async function getPramsSections(supabase: Client, projectId: string) {
  const { data, error } = await supabase
    .from("prams_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

/**
 * Announcement variants for one PRAMS update, joined back to their global
 * registry identity (reference_code is owned by the registry, never the
 * per-update row — see the Phase 2A architecture decision).
 */
export async function getPramsAnnouncementVersions(supabase: Client, projectId: string) {
  const { data, error } = await supabase
    .from("prams_announcement_versions")
    .select("*, announcement:prams_announcements(*), section:prams_sections(*)")
    .eq("project_id", projectId)
    .order("column_order");
  if (error) throw error;
  return data;
}

export async function getPramsSectionSummary(supabase: Client, projectId: string) {
  const versions = await getPramsAnnouncementVersions(supabase, projectId);
  const sections = await getPramsSections(supabase, projectId);

  return sections.map((section) => {
    const inSection = versions.filter((v) => v.section_id === section.id);
    return {
      section,
      variantCount: inSection.filter((v) => v.status === "active").length,
    };
  });
}

// ── Phase 2B: Standard Radio scripts ───────────────────────────────────────

/** One script with its variants, ordered by column_order, for a Standard Radio project. */
export async function getScriptsForProject(supabase: Client, projectId: string) {
  const { data, error } = await supabase
    .from("scripts")
    .select("*, script_variants(*)")
    .eq("project_id", projectId)
    .order("title");
  if (error) throw error;
  return data.map((script) => ({
    ...script,
    script_variants: [...script.script_variants].sort(
      (a, b) => (a.column_order ?? 0) - (b.column_order ?? 0),
    ),
  }));
}

/** The latest revision (highest revision_number) for one variant, with its ordered lines. */
export async function getLatestRevisionWithLines(supabase: Client, variantId: string) {
  const { data: revisions, error } = await supabase
    .from("script_revisions")
    .select("*, script_lines(*)")
    .eq("variant_id", variantId)
    .order("revision_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const revision = revisions[0];
  if (!revision) return null;
  return {
    ...revision,
    script_lines: [...revision.script_lines].sort((a, b) => a.sort_order - b.sort_order),
  };
}

// ── Phase 2B: PRAMS matrix ──────────────────────────────────────────────────

/**
 * One section's matrix, live: active rows in order, each with its CURRENT
 * wording groups (announcement reference codes sharing that group, plus the
 * text — null for an intentional blank). Sharing here reflects real
 * prams_wording_group_members rows, never inferred from matching text — see
 * docs/phase-2b-schema.md.
 */
export async function getMatrixForSection(supabase: Client, sectionId: string) {
  const { data: rows, error: rowsError } = await supabase
    .from("prams_matrix_rows")
    .select("*")
    .eq("section_id", sectionId)
    .eq("status", "active")
    .order("sort_order");
  if (rowsError) throw rowsError;
  if (rows.length === 0) return [];

  const { data: cells, error: cellsError } = await supabase
    .from("prams_matrix_cells")
    .select("id, row_id, announcement_version:prams_announcement_versions(id, announcement:prams_announcements(reference_code))")
    .in(
      "row_id",
      rows.map((r) => r.id),
    );
  if (cellsError) throw cellsError;

  const { data: members, error: membersError } = await supabase
    .from("prams_wording_group_members")
    .select("matrix_cell_id, wording_group:prams_wording_groups(id, text)")
    .in(
      "matrix_cell_id",
      cells.map((c) => c.id),
    )
    .eq("is_current", true);
  if (membersError) throw membersError;

  return rows.map((row) => {
    const rowCells = cells.filter((c) => c.row_id === row.id);
    const byGroup = new Map<string, { text: string | null; referenceCodes: string[] }>();
    for (const cell of rowCells) {
      const member = members.find((m) => m.matrix_cell_id === cell.id);
      if (!member?.wording_group) continue;
      const code = cell.announcement_version?.announcement?.reference_code;
      if (!code) continue;
      const existing = byGroup.get(member.wording_group.id);
      if (existing) existing.referenceCodes.push(code);
      else byGroup.set(member.wording_group.id, { text: member.wording_group.text, referenceCodes: [code] });
    }
    return { row, groups: Array.from(byGroup.values()) };
  });
}
