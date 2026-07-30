/**
 * Phase 2A repository/service layer — thin, typed wrappers over the tables
 * that exist so far (organisations, users, campaigns, projects, the PRAMS
 * update/registry/section tables). Every function takes a Supabase client
 * so callers control which identity the query runs as (browser/session,
 * server/session, or service-role) — RLS enforces the rest.
 *
 * There is deliberately no equivalent here yet for scripts, audio items/
 * versions, comments, change requests, or approvals — those tables don't
 * exist until Phase 2B, so the frontend continues to read them from
 * src/lib/mock/ (see docs/phase-2a-limitations.md).
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

/** All projects visible to the caller under RLS — not scoped by organisation here; RLS already is. */
export async function getProjects(supabase: Client) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .is("deleted_at", null)
    .order("name");
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
