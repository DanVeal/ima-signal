/**
 * Read queries for the review domain — the recording page's script panel,
 * comment threads, approvals, change requests, activity, and participants.
 * Same pattern as audio/queries.ts: plain functions taking a Supabase
 * client, RLS enforces access, nothing here writes anything (see
 * service.ts for every mutation, all of which go through the RPC functions
 * in 20260731120100_review_functions.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getUploaderNames } from "@/lib/audio/queries";

type Client = SupabaseClient<Database>;
type ReviewStatus = Database["public"]["Enums"]["review_status"];

// ── Script panel ────────────────────────────────────────────────────────
//
// One shape regardless of origin (Standard Radio script revision vs. PRAMS
// matrix column), so the Script Panel component never needs to know which
// kind of project it's rendering — and so a future transcription column
// can sit beside `lines` without redesigning either side.

export interface ScriptLine {
  sortOrder: number;
  text: string | null;
}

export interface ScriptAlt {
  label: string;
  body: string;
}

export type ScriptPanelData =
  | {
      kind: "script_revision";
      revisionId: string;
      revisionNumber: number;
      isApprovedForRecording: boolean;
      lines: ScriptLine[];
      /** The line this revision's alts (if any) are meant to be inserted after — at most one alt is ever used in a given recording. */
      anchorLineSortOrder: number | null;
      alts: ScriptAlt[];
    }
  | {
      kind: "prams_matrix";
      sectionId: string;
      lines: ScriptLine[];
    }
  | { kind: "none" };

export async function getScriptLinesForAudioItem(supabase: Client, audioItemId: string): Promise<ScriptPanelData> {
  const { data: item, error: itemError } = await supabase
    .from("audio_items")
    .select("script_variant_id, announcement_version:prams_announcement_versions(id, section_id)")
    .eq("id", audioItemId)
    .single();
  if (itemError) throw itemError;

  if (item.script_variant_id) {
    const { data: revisions, error } = await supabase
      .from("script_revisions")
      .select("*, script_lines(*), script_alts(*)")
      .eq("variant_id", item.script_variant_id)
      .order("revision_number", { ascending: false });
    if (error) throw error;
    if (revisions.length === 0) return { kind: "none" };

    const revision = revisions.find((r) => r.is_approved_for_recording) ?? revisions[0];
    return {
      kind: "script_revision",
      revisionId: revision.id,
      revisionNumber: revision.revision_number,
      isApprovedForRecording: revision.is_approved_for_recording,
      lines: [...revision.script_lines]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({ sortOrder: l.sort_order, text: l.text })),
      anchorLineSortOrder: revision.anchor_line_sort_order,
      alts: [...revision.script_alts]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => ({ label: a.label, body: a.body })),
    };
  }

  const announcementVersion = item.announcement_version;
  if (!announcementVersion?.section_id) return { kind: "none" };

  const { data: rows, error: rowsError } = await supabase
    .from("prams_matrix_rows")
    .select("*")
    .eq("section_id", announcementVersion.section_id)
    .eq("status", "active")
    .order("sort_order");
  if (rowsError) throw rowsError;
  if (rows.length === 0) return { kind: "prams_matrix", sectionId: announcementVersion.section_id, lines: [] };

  const { data: cells, error: cellsError } = await supabase
    .from("prams_matrix_cells")
    .select("id, row_id")
    .in(
      "row_id",
      rows.map((r) => r.id),
    )
    .eq("announcement_version_id", announcementVersion.id);
  if (cellsError) throw cellsError;

  const { data: members, error: membersError } = await supabase
    .from("prams_wording_group_members")
    .select("matrix_cell_id, wording_group:prams_wording_groups(text)")
    .in(
      "matrix_cell_id",
      cells.map((c) => c.id),
    )
    .eq("is_current", true);
  if (membersError) throw membersError;

  const lines = rows.map((row, index) => {
    const cell = cells.find((c) => c.row_id === row.id);
    const member = cell ? members.find((m) => m.matrix_cell_id === cell.id) : undefined;
    return { sortOrder: index, text: member?.wording_group?.text ?? null };
  });

  return { kind: "prams_matrix", sectionId: announcementVersion.section_id, lines };
}

// ── Review ──────────────────────────────────────────────────────────────

export interface ReviewSummary {
  id: string;
  audioItemId: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export async function getReviewForAudioItem(supabase: Client, audioItemId: string): Promise<ReviewSummary> {
  const { data, error } = await supabase.from("reviews").select("*").eq("audio_item_id", audioItemId).single();
  if (error) throw error;
  return {
    id: data.id,
    audioItemId: data.audio_item_id,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export interface ReviewParticipant {
  userId: string;
  roleAtTime: string;
  firstSeenAt: string;
  fullName: string;
  avatarInitials: string;
}

export async function getReviewParticipants(supabase: Client, reviewId: string): Promise<ReviewParticipant[]> {
  const { data, error } = await supabase
    .from("review_participants")
    .select("*")
    .eq("review_id", reviewId)
    .order("first_seen_at");
  if (error) throw error;

  const names = await getUploaderNames(
    supabase,
    data.map((p) => p.user_id),
  );
  return data.map((p) => ({
    userId: p.user_id,
    roleAtTime: p.role_at_time,
    firstSeenAt: p.first_seen_at,
    fullName: names.get(p.user_id)?.fullName ?? "Unknown",
    avatarInitials: names.get(p.user_id)?.avatarInitials ?? "?",
  }));
}

// ── Comments ────────────────────────────────────────────────────────────

export interface CommentEdit {
  previousBody: string;
  editedAt: string;
}

export interface CommentRecord {
  id: string;
  threadId: string;
  authorUserId: string;
  authorName: string;
  authorAvatarInitials: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  edits: CommentEdit[];
}

export interface CommentThread {
  id: string;
  audioItemId: string;
  audioVersionId: string;
  isTimecoded: boolean;
  startMs: number | null;
  endMs: number | null;
  createdByUserId: string;
  createdAt: string;
  comments: CommentRecord[];
  isResolved: boolean;
  lastResolutionAt: string | null;
  lastResolutionByUserId: string | null;
}

/** Every thread for an audio item, each with its full (non-deleted-included) comment list and derived open/resolved state. */
export async function getCommentThreadsForAudioItem(supabase: Client, audioItemId: string): Promise<CommentThread[]> {
  const { data: threads, error: threadsError } = await supabase
    .from("comment_threads")
    .select("*")
    .eq("audio_item_id", audioItemId)
    .order("created_at");
  if (threadsError) throw threadsError;
  if (threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id);

  const [{ data: comments, error: commentsError }, { data: resolutions, error: resolutionsError }] =
    await Promise.all([
      supabase.from("comments").select("*").in("thread_id", threadIds).order("created_at"),
      supabase
        .from("comment_thread_resolutions")
        .select("*")
        .in("thread_id", threadIds)
        .order("created_at"),
    ]);
  if (commentsError) throw commentsError;
  if (resolutionsError) throw resolutionsError;

  const commentIds = comments.map((c) => c.id);
  const { data: edits, error: editsError } =
    commentIds.length > 0
      ? await supabase.from("comment_edits").select("*").in("comment_id", commentIds).order("edited_at")
      : { data: [] as Database["public"]["Tables"]["comment_edits"]["Row"][], error: null };
  if (editsError) throw editsError;

  const names = await getUploaderNames(supabase, [
    ...comments.map((c) => c.author_user_id),
    ...threads.map((t) => t.created_by_user_id),
    ...resolutions.map((r) => r.actor_user_id),
  ]);

  const latestResolutionByThread = new Map<string, (typeof resolutions)[number]>();
  for (const resolution of resolutions) {
    latestResolutionByThread.set(resolution.thread_id, resolution);
  }

  return threads.map((thread) => {
    const threadComments = comments
      .filter((c) => c.thread_id === thread.id)
      .map((c) => ({
        id: c.id,
        threadId: c.thread_id,
        authorUserId: c.author_user_id,
        authorName: names.get(c.author_user_id)?.fullName ?? "Unknown",
        authorAvatarInitials: names.get(c.author_user_id)?.avatarInitials ?? "?",
        body: c.body,
        mentionedUserIds: c.mentioned_user_ids,
        createdAt: c.created_at,
        editedAt: c.edited_at,
        deletedAt: c.deleted_at,
        edits: edits
          .filter((e) => e.comment_id === c.id)
          .map((e) => ({ previousBody: e.previous_body, editedAt: e.edited_at })),
      }));

    const latestResolution = latestResolutionByThread.get(thread.id);
    return {
      id: thread.id,
      audioItemId: thread.audio_item_id,
      audioVersionId: thread.audio_version_id,
      isTimecoded: thread.is_timecoded,
      startMs: thread.start_ms,
      endMs: thread.end_ms,
      createdByUserId: thread.created_by_user_id,
      createdAt: thread.created_at,
      comments: threadComments,
      isResolved: latestResolution?.action === "resolved",
      lastResolutionAt: latestResolution?.created_at ?? null,
      lastResolutionByUserId: latestResolution?.actor_user_id ?? null,
    };
  });
}

// ── Approvals ───────────────────────────────────────────────────────────

export type ApprovalDecisionValue = "approved" | "changes_requested" | "withdrawn";

export interface ApprovalRecord {
  id: string;
  audioItemId: string;
  audioVersionId: string;
  decision: ApprovalDecisionValue;
  decidedByUserId: string;
  decidedByName: string;
  note: string | null;
  createdAt: string;
}

export interface ApprovalsForAudioItem {
  history: ApprovalRecord[];
  /** Latest decision per audio_version_id — the version a decision was ever made against always keeps its own standing, even once superseded. */
  currentStandingByVersion: Map<string, ApprovalRecord>;
}

export async function getApprovalsForAudioItem(supabase: Client, audioItemId: string): Promise<ApprovalsForAudioItem> {
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("audio_item_id", audioItemId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await getUploaderNames(
    supabase,
    data.map((a) => a.decided_by_user_id),
  );
  const history = data.map((a) => ({
    id: a.id,
    audioItemId: a.audio_item_id,
    audioVersionId: a.audio_version_id,
    decision: a.decision as ApprovalDecisionValue,
    decidedByUserId: a.decided_by_user_id,
    decidedByName: names.get(a.decided_by_user_id)?.fullName ?? "Unknown",
    note: a.note,
    createdAt: a.created_at,
  }));

  // history is newest-first, so the first occurrence per version is its latest decision.
  const currentStandingByVersion = new Map<string, ApprovalRecord>();
  for (const approval of history) {
    if (!currentStandingByVersion.has(approval.audioVersionId)) {
      currentStandingByVersion.set(approval.audioVersionId, approval);
    }
  }

  return { history, currentStandingByVersion };
}

// ── Change requests ─────────────────────────────────────────────────────

export interface ChangeRequestRecord {
  id: string;
  audioItemId: string;
  audioVersionId: string;
  category: string;
  message: string;
  timecodeMs: number | null;
  priority: string;
  status: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
}

export async function getChangeRequestsForAudioItem(supabase: Client, audioItemId: string): Promise<ChangeRequestRecord[]> {
  const { data, error } = await supabase
    .from("change_requests")
    .select("*")
    .eq("audio_item_id", audioItemId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await getUploaderNames(supabase, [
    ...data.map((c) => c.created_by_user_id),
    ...data.map((c) => c.resolved_by_user_id),
  ]);

  return data.map((c) => ({
    id: c.id,
    audioItemId: c.audio_item_id,
    audioVersionId: c.audio_version_id,
    category: c.category,
    message: c.message,
    timecodeMs: c.timecode_ms,
    priority: c.priority,
    status: c.status,
    createdByUserId: c.created_by_user_id,
    createdByName: names.get(c.created_by_user_id)?.fullName ?? "Unknown",
    createdAt: c.created_at,
    resolvedAt: c.resolved_at,
    resolvedByUserId: c.resolved_by_user_id,
    resolvedByName: c.resolved_by_user_id ? (names.get(c.resolved_by_user_id)?.fullName ?? "Unknown") : null,
  }));
}

// ── Activity ────────────────────────────────────────────────────────────

export interface ReviewActivityEvent {
  id: string;
  action: string;
  entityType: string;
  entityLabel: string;
  actorUserId: string | null;
  actorName: string;
  metadata: Database["public"]["Tables"]["activity_events"]["Row"]["metadata"];
  createdAt: string;
}

/** The recording page's unified timeline — every review + audio-version event for this item, newest first. */
export async function getActivityForAudioItem(supabase: Client, audioItemId: string): Promise<ReviewActivityEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("*")
    .eq("audio_item_id", audioItemId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const names = await getUploaderNames(
    supabase,
    data.map((e) => e.actor_user_id),
  );
  return data.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entity_type,
    entityLabel: e.entity_label,
    actorUserId: e.actor_user_id,
    actorName: e.actor_user_id ? (names.get(e.actor_user_id)?.fullName ?? "Unknown") : "System",
    metadata: e.metadata,
    createdAt: e.created_at,
  }));
}

// ── Permissions ─────────────────────────────────────────────────────────
//
// can_comment_on_review / can_decide_review are the exact same predicates
// the RLS policies and RPC functions gate on (see review_domain.sql) —
// calling them here means the UI's "can you approve this?" question is
// answered by the one real source of truth, never a client-side re-guess
// of the permission matrix that could drift out of sync with it.

export interface ReviewPermissions {
  userId: string | null;
  fullName: string;
  avatarInitials: string;
  role: string | null;
  /** IMA admin/producer — sees and can do everything, including archiving a review. */
  isManager: boolean;
  /** Comment, reply, resolve/reopen threads, upload. */
  canComment: boolean;
  /** Approve, request changes, create/resolve change requests. Never true for a studio role. */
  canDecide: boolean;
}

export async function getReviewPermissions(supabase: Client, projectId: string): Promise<ReviewPermissions> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: canComment }, { data: canDecide }, { data: isManager }] = await Promise.all([
    user
      ? supabase.from("user_profiles").select("id, full_name, avatar_initials, role").eq("auth_user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("can_comment_on_review", { target_project_id: projectId }),
    supabase.rpc("can_decide_review", { target_project_id: projectId }),
    supabase.rpc("is_ima_manager"),
  ]);

  return {
    userId: profile?.id ?? null,
    fullName: profile?.full_name ?? "You",
    avatarInitials: profile?.avatar_initials ?? "?",
    role: profile?.role ?? null,
    isManager: isManager ?? false,
    canComment: canComment ?? false,
    canDecide: canDecide ?? false,
  };
}

export interface MentionableUser {
  id: string;
  fullName: string;
  avatarInitials: string;
}

/** Everyone who could plausibly be @mentioned on this project's reviews: every IMA/Jet2 user, plus the assigned studio's own users. Mirrors can_access_project's tenancy rule. */
export async function getMentionableUsersForProject(supabase: Client, projectId: string): Promise<MentionableUser[]> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("studio_organisation_id")
    .eq("id", projectId)
    .single();
  if (projectError) throw projectError;

  const { data: orgs, error: orgsError } = await supabase.from("organisations").select("id, type");
  if (orgsError) throw orgsError;
  const orgIds = orgs
    .filter((o) => o.type === "ima" || o.type === "jet2" || o.id === project.studio_organisation_id)
    .map((o) => o.id);
  if (orgIds.length === 0) return [];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, full_name, avatar_initials")
    .in("organisation_id", orgIds)
    .order("full_name");
  if (error) throw error;
  return data.map((u) => ({ id: u.id, fullName: u.full_name, avatarInitials: u.avatar_initials }));
}
