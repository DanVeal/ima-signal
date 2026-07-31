/**
 * Real activity_events queries (Phase 3.0) — shared by the Project Overview
 * page's Activity tab and the global /activity page. RLS already scopes
 * every row to what the caller can see (see activity_events_select_accessible).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getUploaderNames } from "@/lib/audio/queries";

type Client = SupabaseClient<Database>;

export interface ActivityFeedEvent {
  id: string;
  action: string;
  entityLabel: string;
  actorName: string;
  projectId: string;
  createdAt: string;
}

async function withActorNames(
  supabase: Client,
  rows: { id: string; action: string; entity_label: string; actor_user_id: string | null; project_id: string; created_at: string }[],
): Promise<ActivityFeedEvent[]> {
  const names = await getUploaderNames(
    supabase,
    rows.map((e) => e.actor_user_id),
  );
  return rows.map((e) => ({
    id: e.id,
    action: e.action,
    entityLabel: e.entity_label,
    actorName: e.actor_user_id ? names.get(e.actor_user_id)?.fullName ?? "Unknown" : "System",
    projectId: e.project_id,
    createdAt: e.created_at,
  }));
}

/** Every event for one project, newest first — the Project Overview page's Activity tab. */
export async function getActivityForProject(
  supabase: Client,
  projectId: string,
  limit = 50,
): Promise<ActivityFeedEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id, action, entity_label, actor_user_id, project_id, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return withActorNames(supabase, data);
}

export interface GlobalActivityEvent extends ActivityFeedEvent {
  actorUserId: string | null;
  projectName: string;
}

export interface ActivityFilterOptions {
  projects: { id: string; name: string }[];
  actors: { id: string; name: string }[];
  actions: string[];
}

/**
 * Every event across every accessible project, newest first — the global
 * /activity page. Filtering (by user/project/action/date range) happens
 * client-side over this one real, RLS-scoped batch, the same pattern the
 * Projects list already uses for its search/type/status filters.
 */
export async function getGlobalActivityFeed(
  supabase: Client,
  limit = 500,
): Promise<{ events: GlobalActivityEvent[]; filterOptions: ActivityFilterOptions }> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id, action, entity_label, actor_user_id, project_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (data.length === 0) return { events: [], filterOptions: { projects: [], actors: [], actions: [] } };

  const [names, { data: projects, error: projectsError }] = await Promise.all([
    getUploaderNames(supabase, data.map((e) => e.actor_user_id)),
    supabase
      .from("projects")
      .select("id, name")
      .in("id", Array.from(new Set(data.map((e) => e.project_id)))),
  ]);
  if (projectsError) throw projectsError;
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  const events = data.map((e) => ({
    id: e.id,
    action: e.action,
    entityLabel: e.entity_label,
    actorName: e.actor_user_id ? names.get(e.actor_user_id)?.fullName ?? "Unknown" : "System",
    actorUserId: e.actor_user_id,
    projectId: e.project_id,
    projectName: projectNames.get(e.project_id) ?? "",
    createdAt: e.created_at,
  }));

  const actorEntries = new Map<string, string>();
  for (const e of data) {
    if (e.actor_user_id) actorEntries.set(e.actor_user_id, names.get(e.actor_user_id)?.fullName ?? "Unknown");
  }

  return {
    events,
    filterOptions: {
      projects: projects.slice().sort((a, b) => a.name.localeCompare(b.name)),
      actors: Array.from(actorEntries, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      actions: Array.from(new Set(data.map((e) => e.action))).sort(),
    },
  };
}
