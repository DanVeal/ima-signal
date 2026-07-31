/**
 * Real queries for the Home dashboard "control room" (Phase 3.0) — every
 * section reads live Supabase data, RLS-scoped to the signed-in user, across
 * whichever projects they can access. No mock data, no new tables: this is
 * the same audio/review/intelligence schema every other real page already
 * reads, just aggregated into one overview. See docs/production-experience.md.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getUploaderNames } from "@/lib/audio/queries";

type Client = SupabaseClient<Database>;
type HealthRating = Database["public"]["Enums"]["health_rating"];

export interface AudioItemRef {
  audioItemId: string;
  projectId: string;
  projectName: string;
  label: string;
}

const AUDIO_ITEM_LABEL_SELECT =
  "id, script_variant:script_variants(variant_code, destination, departure_airport, script:scripts(project_id, project:projects(name))), announcement_version:prams_announcement_versions(project_id, title_at_import, project:projects(name), announcement:prams_announcements(reference_code))";

type AudioItemWithLabel = {
  id: string;
  script_variant: {
    variant_code: string;
    destination: string | null;
    departure_airport: string | null;
    script: { project_id: string; project: { name: string } | null } | null;
  } | null;
  announcement_version: {
    project_id: string;
    title_at_import: string;
    project: { name: string } | null;
    announcement: { reference_code: string } | null;
  } | null;
};

function toAudioItemRef(item: AudioItemWithLabel | null): AudioItemRef | null {
  if (!item) return null;
  const sv = item.script_variant;
  const av = item.announcement_version;
  const projectId = sv?.script?.project_id ?? av?.project_id;
  if (!projectId) return null;
  const label = sv
    ? [sv.variant_code, [sv.departure_airport, sv.destination].filter(Boolean).join(" → ")]
        .filter(Boolean)
        .join(" — ")
    : `${av?.announcement?.reference_code ?? "?"} — ${av?.title_at_import ?? ""}`;
  return {
    audioItemId: item.id,
    projectId,
    projectName: sv?.script?.project?.name ?? av?.project?.name ?? "",
    label,
  };
}

export interface AttentionItem {
  id: string;
  audioItem: AudioItemRef;
  category: string;
  priority: string;
  message: string;
  createdAt: string;
}

/** Open change requests across every accessible project — the most direct "someone is waiting on you" signal that already exists. */
export async function getOpenChangeRequests(
  supabase: Client,
  limit = 8,
): Promise<{ total: number; items: AttentionItem[] }> {
  const [{ count }, { data, error }] = await Promise.all([
    supabase.from("change_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("change_requests")
      .select(`id, category, priority, message, created_at, audio_item:audio_items(${AUDIO_ITEM_LABEL_SELECT})`)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (error) throw error;

  const items: AttentionItem[] = [];
  for (const row of data) {
    const audioItem = toAudioItemRef(row.audio_item);
    if (!audioItem) continue;
    items.push({
      id: row.id,
      audioItem,
      category: row.category,
      priority: row.priority,
      message: row.message,
      createdAt: row.created_at,
    });
  }
  return { total: count ?? 0, items };
}

export interface ReviewAwaitingApproval {
  reviewId: string;
  audioItem: AudioItemRef;
  status: Database["public"]["Enums"]["review_status"];
  updatedAt: string;
}

/** Reviews sitting in ready_for_review/in_review — a decision (approve or request changes) is the next real step for each. */
export async function getReviewsAwaitingApproval(
  supabase: Client,
  limit = 8,
): Promise<{ total: number; items: ReviewAwaitingApproval[] }> {
  const statuses = ["ready_for_review", "in_review"] as const;
  const [{ count }, { data, error }] = await Promise.all([
    supabase.from("reviews").select("id", { count: "exact", head: true }).in("status", statuses),
    supabase
      .from("reviews")
      .select(`id, status, updated_at, audio_item:audio_items(${AUDIO_ITEM_LABEL_SELECT})`)
      .in("status", statuses)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  if (error) throw error;

  const items: ReviewAwaitingApproval[] = [];
  for (const row of data) {
    const audioItem = toAudioItemRef(row.audio_item);
    if (!audioItem) continue;
    items.push({ reviewId: row.id, audioItem, status: row.status, updatedAt: row.updated_at });
  }
  return { total: count ?? 0, items };
}

export interface ReviewQueueEntry extends ReviewAwaitingApproval {
  overdue: boolean;
}

/**
 * The full (unlimited) Review Queue page — every review still awaiting a
 * decision, ranked overdue-first then by how long it's been waiting.
 * "Overdue" means the review's project has already passed its internal or
 * client review deadline, mirroring the wording the original review-queue
 * copy already used.
 */
export async function getReviewQueue(supabase: Client): Promise<ReviewQueueEntry[]> {
  const { items } = await getReviewsAwaitingApproval(supabase, 500);
  if (items.length === 0) return [];

  const projectIds = Array.from(new Set(items.map((item) => item.audioItem.projectId)));
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, internal_review_deadline, client_review_deadline")
    .in("id", projectIds);
  if (error) throw error;

  const now = new Date().toISOString();
  const deadlinesByProject = new Map(projects.map((p) => [p.id, p]));

  const entries: ReviewQueueEntry[] = items.map((item) => {
    const deadlines = deadlinesByProject.get(item.audioItem.projectId);
    const overdue = !!(
      (deadlines?.internal_review_deadline && deadlines.internal_review_deadline < now) ||
      (deadlines?.client_review_deadline && deadlines.client_review_deadline < now)
    );
    return { ...item, overdue };
  });

  return entries.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

export interface AiQueueItem {
  jobId: string;
  audioItem: AudioItemRef;
  jobType: Database["public"]["Enums"]["ai_job_type"];
  status: Database["public"]["Enums"]["ai_job_status"];
  createdAt: string;
}

const AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT = `audio_item:audio_items!audio_versions_audio_item_id_fkey(${AUDIO_ITEM_LABEL_SELECT})`;

/** Queued/processing AI jobs — the same background queue from Phase 2C.3, surfaced so a producer can see AI work in flight without opening every recording. */
export async function getAiProcessingQueue(
  supabase: Client,
  limit = 8,
): Promise<{ total: number; items: AiQueueItem[] }> {
  const statuses = ["queued", "processing"] as const;
  const [{ count }, { data, error }] = await Promise.all([
    supabase.from("ai_jobs").select("id", { count: "exact", head: true }).in("status", statuses),
    supabase
      .from("ai_jobs")
      .select(
        `id, job_type, status, created_at, audio_version:audio_versions(${AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT})`,
      )
      .in("status", statuses)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);
  if (error) throw error;

  const items: AiQueueItem[] = [];
  for (const row of data) {
    const audioItem = toAudioItemRef(row.audio_version?.audio_item ?? null);
    if (!audioItem) continue;
    items.push({ jobId: row.id, audioItem, jobType: row.job_type, status: row.status, createdAt: row.created_at });
  }
  return { total: count ?? 0, items };
}

export interface RecordingHealthSummary {
  counts: Record<HealthRating, number>;
  needsAttention: (AudioItemRef & { rating: HealthRating })[];
}

/**
 * Latest health snapshot per recording, aggregated by rating. There's no
 * "current snapshot" column on audio_versions (every snapshot is an
 * immutable, versioned event — see docs/intelligence-engine.md), so this
 * samples the most recent snapshots and keeps only the newest one per
 * audio_version_id client-side rather than adding a new SQL function for a
 * dashboard widget.
 */
export async function getRecordingHealthSummary(supabase: Client, sampleSize = 300): Promise<RecordingHealthSummary> {
  const { data, error } = await supabase
    .from("recording_health_snapshots")
    .select(`audio_version_id, overall_rating, generated_at, audio_version:audio_versions(${AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT})`)
    .order("generated_at", { ascending: false })
    .limit(sampleSize);
  if (error) throw error;

  const latestByVersion = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (!latestByVersion.has(row.audio_version_id)) latestByVersion.set(row.audio_version_id, row);
  }

  const counts: Record<HealthRating, number> = {
    excellent: 0,
    good: 0,
    needs_review: 0,
    attention_required: 0,
  };
  const needsAttention: (AudioItemRef & { rating: HealthRating })[] = [];
  for (const row of latestByVersion.values()) {
    counts[row.overall_rating] += 1;
    if (row.overall_rating === "attention_required" || row.overall_rating === "needs_review") {
      const audioItem = toAudioItemRef(row.audio_version?.audio_item ?? null);
      if (audioItem) needsAttention.push({ ...audioItem, rating: row.overall_rating });
    }
  }
  needsAttention.sort((a, b) => (a.rating === b.rating ? 0 : a.rating === "attention_required" ? -1 : 1));

  return { counts, needsAttention: needsAttention.slice(0, 6) };
}

export interface UpcomingDelivery {
  projectId: string;
  projectName: string;
  nextDeadlineLabel: string;
  nextDeadline: string;
}

const DEADLINE_FIELDS: { key: "recording_deadline" | "internal_review_deadline" | "client_review_deadline" | "live_date"; label: string }[] = [
  { key: "recording_deadline", label: "Recording due" },
  { key: "internal_review_deadline", label: "IMA review due" },
  { key: "client_review_deadline", label: "Jet2 review due" },
  { key: "live_date", label: "Live date" },
];

/** Every accessible, undelivered project's nearest upcoming deadline across all four deadline fields — whichever is soonest is the one that actually matters right now. */
export async function getUpcomingDeliveries(supabase: Client, limit = 6): Promise<UpcomingDelivery[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, recording_deadline, internal_review_deadline, client_review_deadline, live_date")
    .is("deleted_at", null)
    .neq("status", "delivered");
  if (error) throw error;

  const now = new Date().toISOString();
  const withNextDeadline: UpcomingDelivery[] = [];
  for (const project of data) {
    let soonest: { label: string; date: string } | null = null;
    for (const field of DEADLINE_FIELDS) {
      const value = project[field.key];
      if (!value || value < now) continue;
      if (!soonest || value < soonest.date) soonest = { label: field.label, date: value };
    }
    if (soonest) {
      withNextDeadline.push({
        projectId: project.id,
        projectName: project.name,
        nextDeadlineLabel: soonest.label,
        nextDeadline: soonest.date,
      });
    }
  }
  return withNextDeadline.sort((a, b) => a.nextDeadline.localeCompare(b.nextDeadline)).slice(0, limit);
}

export interface DashboardActivityEvent {
  id: string;
  action: string;
  entityLabel: string;
  actorName: string;
  projectId: string;
  projectName: string;
  createdAt: string;
}

/** The most recent activity across every accessible project — every event type the review engine and intelligence engine already log, RLS-scoped. */
export async function getRecentActivity(supabase: Client, limit = 10): Promise<DashboardActivityEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id, action, entity_label, actor_user_id, project_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (data.length === 0) return [];

  const [names, { data: projects, error: projectsError }] = await Promise.all([
    getUploaderNames(supabase, data.map((e) => e.actor_user_id)),
    supabase
      .from("projects")
      .select("id, name")
      .in("id", Array.from(new Set(data.map((e) => e.project_id)))),
  ]);
  if (projectsError) throw projectsError;
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  return data.map((e) => ({
    id: e.id,
    action: e.action,
    entityLabel: e.entity_label,
    actorName: e.actor_user_id ? names.get(e.actor_user_id)?.fullName ?? "Unknown" : "System",
    projectId: e.project_id,
    projectName: projectNames.get(e.project_id) ?? "",
    createdAt: e.created_at,
  }));
}

export interface DashboardOverview {
  changeRequests: { total: number; items: AttentionItem[] };
  reviewsAwaitingApproval: { total: number; items: ReviewAwaitingApproval[] };
  aiQueue: { total: number; items: AiQueueItem[] };
  health: RecordingHealthSummary;
  upcomingDeliveries: UpcomingDelivery[];
  recentActivity: DashboardActivityEvent[];
}

export async function getDashboardOverview(supabase: Client): Promise<DashboardOverview> {
  const [changeRequests, reviewsAwaitingApproval, aiQueue, health, upcomingDeliveries, recentActivity] =
    await Promise.all([
      getOpenChangeRequests(supabase),
      getReviewsAwaitingApproval(supabase),
      getAiProcessingQueue(supabase),
      getRecordingHealthSummary(supabase),
      getUpcomingDeliveries(supabase),
      getRecentActivity(supabase),
    ]);
  return { changeRequests, reviewsAwaitingApproval, aiQueue, health, upcomingDeliveries, recentActivity };
}
