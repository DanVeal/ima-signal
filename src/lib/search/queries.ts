/**
 * Global search (⌘K) — read-only queries across the entities the product
 * spec calls out: Projects, Scripts, PRAMS references, Recordings, Comments,
 * Transcript text, and Users. Every query runs as the signed-in user's own
 * request-scoped client (see search/actions.ts), so RLS is the only access
 * control — a result is only ever returned if the caller could already see
 * that row on the page it links to.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type SearchResultType =
  | "project"
  | "script"
  | "prams_reference"
  | "recording"
  | "comment"
  | "transcript"
  | "user";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

/** Postgres LIKE/ILIKE treats `%` and `_` as wildcards — escape them so a search for "50%" or "a_b" matches literally. */
function likeTerm(query: string) {
  return `%${query.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

function projectIdFromAudioItem(audioItem: {
  script_variant: { script: { project_id: string } | null } | null;
  announcement_version: { project_id: string } | null;
} | null): string | null {
  return audioItem?.script_variant?.script?.project_id ?? audioItem?.announcement_version?.project_id ?? null;
}

const AUDIO_ITEM_PROJECT_SELECT =
  "id, script_variant:script_variants(script:scripts(project_id)), announcement_version:prams_announcement_versions(project_id)";

/**
 * audio_versions and audio_items have two FK paths between them
 * (audio_versions.audio_item_id, and audio_items.current_version_id) —
 * PostgREST can't infer which to embed without disambiguation whenever the
 * query starts from audio_versions (or transcript_versions -> transcripts ->
 * audio_versions) and reaches back to audio_items.
 */
const AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT = `audio_item:audio_items!audio_versions_audio_item_id_fkey(${AUDIO_ITEM_PROJECT_SELECT})`;

async function searchProjects(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, job_number")
    .is("deleted_at", null)
    .or(`name.ilike.${term},job_number.ilike.${term}`)
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    type: "project",
    id: row.id,
    title: row.name,
    subtitle: row.job_number,
    url: `/projects/${row.id}`,
  }));
}

async function searchScripts(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("scripts")
    .select("id, title, project_id")
    .ilike("title", term)
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    type: "script",
    id: row.id,
    title: row.title,
    subtitle: "Script",
    url: `/projects/${row.project_id}`,
  }));
}

async function searchPramsReferences(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data: announcements, error: announcementsError } = await supabase
    .from("prams_announcements")
    .select("id, reference_code, current_title")
    .or(`reference_code.ilike.${term},current_title.ilike.${term}`)
    .limit(limit);
  if (announcementsError) throw announcementsError;
  if (announcements.length === 0) return [];

  const { data: versions, error: versionsError } = await supabase
    .from("prams_announcement_versions")
    .select("id, project_id, announcement_id")
    .in(
      "announcement_id",
      announcements.map((a) => a.id),
    )
    .eq("status", "active")
    .limit(limit);
  if (versionsError) throw versionsError;

  const seenAnnouncementIds = new Set<string>();
  const results: SearchResult[] = [];
  for (const version of versions) {
    if (seenAnnouncementIds.has(version.announcement_id)) continue;
    const announcement = announcements.find((a) => a.id === version.announcement_id);
    if (!announcement) continue;
    seenAnnouncementIds.add(version.announcement_id);
    results.push({
      type: "prams_reference",
      id: announcement.id,
      title: announcement.reference_code,
      subtitle: announcement.current_title,
      url: `/projects/${version.project_id}`,
    });
  }
  return results;
}

async function searchRecordings(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("audio_versions")
    .select(`id, original_filename, ${AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT}`)
    .ilike("original_filename", term)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const seenAudioItemIds = new Set<string>();
  const results: SearchResult[] = [];
  for (const row of data) {
    const audioItem = row.audio_item;
    if (!audioItem || seenAudioItemIds.has(audioItem.id)) continue;
    const projectId = projectIdFromAudioItem(audioItem);
    if (!projectId) continue;
    seenAudioItemIds.add(audioItem.id);
    results.push({
      type: "recording",
      id: audioItem.id,
      title: row.original_filename,
      subtitle: "Recording",
      url: `/projects/${projectId}/recordings/${audioItem.id}`,
    });
  }
  return results;
}

async function searchComments(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(`id, body, thread_id, thread:comment_threads(audio_item_id, audio_item:audio_items(${AUDIO_ITEM_PROJECT_SELECT}))`)
    .is("deleted_at", null)
    .ilike("body", term)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const results: SearchResult[] = [];
  for (const row of data) {
    const audioItem = row.thread?.audio_item ?? null;
    const projectId = projectIdFromAudioItem(audioItem);
    if (!row.thread || !projectId) continue;
    results.push({
      type: "comment",
      id: row.id,
      title: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
      subtitle: "Comment",
      url: `/projects/${projectId}/recordings/${row.thread.audio_item_id}?thread=${row.thread_id}`,
    });
  }
  return results;
}

async function searchTranscripts(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("transcript_versions")
    .select(
      // transcripts has two FKs to transcript_versions (transcript_id, and
      // current_transcript_version_id) — PostgREST can't infer which one to
      // embed here without disambiguation.
      `id, full_text, transcript:transcripts!transcript_versions_transcript_id_fkey(audio_version:audio_versions(${AUDIO_ITEM_FROM_AUDIO_VERSION_SELECT}))`,
    )
    .ilike("full_text", term)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const seenAudioItemIds = new Set<string>();
  const results: SearchResult[] = [];
  for (const row of data) {
    const audioItem = row.transcript?.audio_version?.audio_item ?? null;
    if (!audioItem || seenAudioItemIds.has(audioItem.id)) continue;
    const projectId = projectIdFromAudioItem(audioItem);
    if (!projectId) continue;
    seenAudioItemIds.add(audioItem.id);
    const matchIndex = row.full_text.toLowerCase().indexOf(term.replace(/^%|%$/g, "").toLowerCase());
    const snippetStart = matchIndex > 20 ? matchIndex - 20 : 0;
    const snippet = `${snippetStart > 0 ? "..." : ""}${row.full_text.slice(snippetStart, snippetStart + 140)}...`;
    results.push({
      type: "transcript",
      id: audioItem.id,
      title: snippet,
      subtitle: "Transcript",
      url: `/projects/${projectId}/recordings/${audioItem.id}`,
    });
  }
  return results;
}

async function searchUsers(supabase: Client, term: string, limit: number): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, role")
    .or(`full_name.ilike.${term},email.ilike.${term}`)
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    type: "user",
    id: row.id,
    title: row.full_name,
    subtitle: row.email,
    url: `/people`,
  }));
}

/**
 * Runs all category searches in parallel and returns the combined,
 * unranked result set — the caller (command palette UI) groups by type.
 * `perCategoryLimit` bounds each query independently so one noisy category
 * (e.g. comments) can never crowd out the others. Uses allSettled rather
 * than all: one category erroring (e.g. a schema change PostgREST can't
 * embed) should never blank out every other category's real results.
 */
export async function globalSearch(
  supabase: Client,
  query: string,
  perCategoryLimit = 5,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const term = likeTerm(trimmed);

  const categories: [string, () => Promise<SearchResult[]>][] = [
    ["projects", () => searchProjects(supabase, term, perCategoryLimit)],
    ["scripts", () => searchScripts(supabase, term, perCategoryLimit)],
    ["prams_references", () => searchPramsReferences(supabase, term, perCategoryLimit)],
    ["recordings", () => searchRecordings(supabase, term, perCategoryLimit)],
    ["comments", () => searchComments(supabase, term, perCategoryLimit)],
    ["transcripts", () => searchTranscripts(supabase, term, perCategoryLimit)],
    ["users", () => searchUsers(supabase, term, perCategoryLimit)],
  ];

  const settled = await Promise.allSettled(categories.map(([, run]) => run()));

  const results: SearchResult[] = [];
  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      console.error(`[search] "${categories[i][0]}" category failed:`, outcome.reason);
    }
  });
  return results;
}
