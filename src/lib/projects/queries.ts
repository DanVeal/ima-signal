/**
 * Real queries for the Projects list (Phase 3.0) — replaces
 * src/lib/mock/queries.ts's getProjectsForOrganisation/getProjectProgress
 * for this page. RLS-scoped: a caller only ever sees the projects/reviews
 * they already have access to everywhere else in the app.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export interface ProjectListRow {
  id: string;
  name: string;
  jobNumber: string;
  type: Database["public"]["Enums"]["project_type"];
  status: Database["public"]["Enums"]["project_status"];
  liveDate: string | null;
  campaignName: string | null;
  studioName: string | null;
  progress: { approved: number; total: number };
}

function resolveProjectId(audioItem: {
  script_variant: { script: { project_id: string } | null } | null;
  announcement_version: { project_id: string } | null;
} | null): string | null {
  return audioItem?.script_variant?.script?.project_id ?? audioItem?.announcement_version?.project_id ?? null;
}

/**
 * "Progress" mirrors what the review workflow actually tracks: of every
 * recording that has a review at all, how many are fully approved. Computed
 * in one query across every accessible review (not per-project N+1 calls)
 * then grouped client-side by resolved project id.
 */
async function getProgressByProject(supabase: Client): Promise<Map<string, { approved: number; total: number }>> {
  const { data, error } = await supabase.from("reviews").select(
    "status, audio_item:audio_items(script_variant:script_variants(script:scripts(project_id)), announcement_version:prams_announcement_versions(project_id))",
  );
  if (error) throw error;

  const progress = new Map<string, { approved: number; total: number }>();
  for (const row of data) {
    const projectId = resolveProjectId(row.audio_item);
    if (!projectId) continue;
    const entry = progress.get(projectId) ?? { approved: 0, total: 0 };
    entry.total += 1;
    if (row.status === "approved") entry.approved += 1;
    progress.set(projectId, entry);
  }
  return progress;
}

export async function getProjectsOverview(supabase: Client): Promise<ProjectListRow[]> {
  const [{ data: projects, error }, progressByProject] = await Promise.all([
    supabase
      .from("projects")
      .select("*, campaign:campaigns(name), studio:organisations(name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    getProgressByProject(supabase),
  ]);
  if (error) throw error;

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    jobNumber: p.job_number,
    type: p.type,
    status: p.status,
    liveDate: p.live_date,
    campaignName: p.campaign?.name ?? null,
    studioName: p.studio?.name ?? null,
    progress: progressByProject.get(p.id) ?? { approved: 0, total: 0 },
  }));
}

export interface ProjectDetail {
  id: string;
  name: string;
  jobNumber: string;
  description: string;
  type: Database["public"]["Enums"]["project_type"];
  status: Database["public"]["Enums"]["project_status"];
  liveDate: string | null;
  recordingDeadline: string | null;
  internalReviewDeadline: string | null;
  clientReviewDeadline: string | null;
  campaignName: string | null;
  studioName: string | null;
  ownerName: string | null;
  jet2ReviewerNames: string[];
  progress: { approved: number; total: number };
  openChangeRequestCount: number;
}

/**
 * Everything the real Project Overview page needs for one project, in as
 * few round trips as the schema allows. Unlike the mock ProjectMeta/
 * BriefPanel this has no briefing-notes/mandatory-wording/claims fields —
 * those never existed as real columns (no new schema this phase), so the
 * real overview shows `description` instead and leaves that content out
 * rather than fabricating it. See docs/production-experience.md.
 */
export async function getProjectDetail(supabase: Client, projectId: string): Promise<ProjectDetail | null> {
  const [{ data: project, error }, { data: reviewers }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        // projects has two paths to user_profiles (owner_user_id, and the
        // project_jet2_reviewers junction) — disambiguate the direct one.
        "*, campaign:campaigns(name), studio:organisations(name), owner:user_profiles!projects_owner_user_id_fkey(full_name)",
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_jet2_reviewers")
      .select("user:user_profiles(full_name)")
      .eq("project_id", projectId),
  ]);
  if (error) throw error;
  if (!project) return null;

  // Standard Radio and PRAMS resolve an audio item's project through two
  // entirely different foreign-key paths (script_variant vs
  // announcement_version) — same branch audio/queries.ts's
  // getRecordingsForProject already uses, rather than one combined query.
  const audioItemIds: string[] =
    project.type === "standard_radio"
      ? await supabase
          .from("script_variants")
          .select("audio_item:audio_items(id), script:scripts!inner(project_id)")
          .eq("script.project_id", projectId)
          .then(({ data }) => (data ?? []).map((v) => v.audio_item?.id).filter((id): id is string => !!id))
      : await supabase
          .from("prams_announcement_versions")
          .select("audio_item:audio_items(id)")
          .eq("project_id", projectId)
          .eq("status", "active")
          .then(({ data }) => (data ?? []).map((v) => v.audio_item?.id).filter((id): id is string => !!id));

  const [{ count: openChangeRequestCount }, { data: reviews }] = await Promise.all([
    audioItemIds.length > 0
      ? supabase
          .from("change_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
          .in("audio_item_id", audioItemIds)
      : Promise.resolve({ count: 0 }),
    audioItemIds.length > 0
      ? supabase.from("reviews").select("status").in("audio_item_id", audioItemIds)
      : Promise.resolve({ data: [] as { status: string }[] }),
  ]);

  return {
    id: project.id,
    name: project.name,
    jobNumber: project.job_number,
    description: project.description,
    type: project.type,
    status: project.status,
    liveDate: project.live_date,
    recordingDeadline: project.recording_deadline,
    internalReviewDeadline: project.internal_review_deadline,
    clientReviewDeadline: project.client_review_deadline,
    campaignName: project.campaign?.name ?? null,
    studioName: project.studio?.name ?? null,
    ownerName: project.owner?.full_name ?? null,
    jet2ReviewerNames: (reviewers ?? []).map((r) => r.user?.full_name).filter((n): n is string => !!n),
    progress: {
      total: reviews?.length ?? 0,
      approved: (reviews ?? []).filter((r) => r.status === "approved").length,
    },
    openChangeRequestCount: openChangeRequestCount ?? 0,
  };
}

