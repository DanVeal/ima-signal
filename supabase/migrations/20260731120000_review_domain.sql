-- Phase 2C.2 — Review Engine: the review domain
--
-- Everything here is append-only by design, following the same pattern
-- Phase 2B/2C.1 already established (prams_wording_groups, audio_versions):
-- where something needs a "current state that changes over time" (a
-- thread's resolved/open state, an approval's standing, a review's overall
-- status), the state is either (a) a narrow, explicitly-audited pointer/
-- status column with every transition logged to activity_events, or
-- (b) derived from the latest row in a pure insert-only event log — never
-- a column that silently overwrites what came before with no trace.
--
-- Concretely:
--   - comment_threads / comments: the thread and its position (timecode,
--     version) are immutable once created. A comment's `body` can be
--     edited by its author, but every prior body is captured in
--     comment_edits first — nothing is lost, only superseded.
--   - comment_thread_resolutions: pure insert-only log ("resolved" /
--     "reopened" events) — current state = the latest row per thread.
--   - approvals: pure insert-only log ("approved" / "changes_requested" /
--     "withdrawn" events, always scoped to one audio_version) — current
--     state = the latest row per (audio_item, audio_version). There is no
--     separate "approval history" table because this table already IS
--     that history; nothing needs to look elsewhere for it.
--   - change_requests / reviews: a genuinely mutable `status` column
--     (matching the existing prams_workbook_imports.status precedent),
--     changed only via the RPC functions in the next migration, each of
--     which logs an activity_events row for every transition.

create type public.review_status as enum (
  'draft',
  'ready_for_review',
  'in_review',
  'changes_requested',
  'approved',
  'superseded',
  'archived'
);

-- One review per audio_item, for the item's whole lifecycle across
-- versions (approvals, below, are what's scoped to a single version).
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  audio_item_id uuid not null unique references public.audio_items (id) on delete cascade,
  status public.review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reviews is
  'One row per audio_item, created automatically the moment the item is. '
  'status is the one genuinely mutable column here — every transition goes '
  'through a function in the next migration and logs an activity_events row.';

create trigger set_reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- Auto-create the review row the instant an audio_item exists — mirrors
-- how a PRAMS matrix cell always exists once its row/column intersection
-- does. Means "does a review exist for this item?" is never a question
-- the application has to ask.
create or replace function public.create_review_for_audio_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reviews (audio_item_id, status) values (new.id, 'draft');
  return new;
end;
$$;

create trigger audio_items_create_review
  after insert on public.audio_items
  for each row execute function public.create_review_for_audio_item();

-- Everyone who has taken any review action on an item — auto-populated
-- (insert-if-not-exists) by the RPC functions, so "who's involved" is
-- always derived from what people actually did, never a manually
-- maintained list that drifts out of date.
create table public.review_participants (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id),
  role_at_time public.user_role not null,
  first_seen_at timestamptz not null default now(),
  unique (review_id, user_id)
);

comment on table public.review_participants is
  'Insert-only: one row per (review, user) the first time that user takes '
  'any review action. role_at_time snapshots their org role at that moment '
  'for audit purposes — their live role may change later.';

-- One thread per comment anchor — either general (is_timecoded = false) or
-- pinned to a point/range in one specific audio_version''s timeline.
-- Immutable once created: replying, resolving, or editing a reply never
-- changes the thread''s own anchor.
create table public.comment_threads (
  id uuid primary key default gen_random_uuid(),
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  audio_version_id uuid not null references public.audio_versions (id),
  is_timecoded boolean not null default false,
  start_ms int,
  end_ms int,
  created_by_user_id uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  constraint comment_threads_timecode_shape check (
    (is_timecoded and start_ms is not null) or (not is_timecoded and start_ms is null and end_ms is null)
  ),
  constraint comment_threads_end_after_start check (end_ms is null or end_ms >= start_ms)
);

comment on table public.comment_threads is
  'The anchor for a comment conversation. A timecoded thread pins to
  start_ms (and optionally end_ms) of audio_version_id''s timeline; a
  general thread has neither. Never updated after creation.';

-- Flat replies within a thread (no nested sub-threads, matching Frame.io/
-- Figma-style comments). `body` may be edited by its author — see
-- comment_edits for the full history that edit never discards.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.comment_threads (id) on delete cascade,
  author_user_id uuid not null references public.user_profiles (id),
  body text not null,
  mentioned_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

comment on table public.comments is
  'One message in a thread. Soft-delete only (deleted_at) — the row and '
  'its body are retained for audit; the UI renders a placeholder once '
  'deleted_at is set. Editing writes the OLD body to comment_edits before '
  'overwriting, so no prior wording is ever actually lost.';

create table public.comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

comment on table public.comment_edits is
  'Insert-only history of every prior version of a comment''s body, '
  'written just before each edit overwrites comments.body.';

create table public.comment_thread_resolutions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.comment_threads (id) on delete cascade,
  action text not null check (action in ('resolved', 'reopened')),
  actor_user_id uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.comment_thread_resolutions is
  'Insert-only log of resolve/reopen events. A thread''s current state is '
  'the action of its most recent row here (or "open" if none exist yet) — '
  'never a boolean column that would lose the history of who reopened what, '
  'when, and how many times.';

-- One row per approval DECISION, always scoped to the specific version it
-- was made against — "a new audio version invalidates previous approvals
-- automatically" means exactly this: a decision for v2 is never treated as
-- if it applies to v3, because it names v2 explicitly and nothing rewrites
-- that. Withdrawing is its own new row (decision = 'withdrawn'), not an
-- update to the row being withdrawn — this table already IS the approval
-- history; there is no separate history table to keep in sync.
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  audio_version_id uuid not null references public.audio_versions (id),
  decision text not null check (decision in ('approved', 'changes_requested', 'withdrawn')),
  decided_by_user_id uuid not null references public.user_profiles (id),
  note text,
  created_at timestamptz not null default now()
);

comment on table public.approvals is
  'Insert-only decision log, one row per decision, each naming the exact '
  'audio_version_id it applies to. Current standing for a version = the '
  'decision of the most recent row for that (audio_item, audio_version) '
  'pair. A version with zero rows has no decision at all yet.';

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  audio_version_id uuid not null references public.audio_versions (id),
  category text not null check (
    category in ('wording', 'pronunciation', 'pacing', 'music_sound', 'technical_issue', 'general')
  ),
  message text not null,
  timecode_ms int,
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  created_by_user_id uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references public.user_profiles (id)
);

comment on table public.change_requests is
  'A specific, structured required change, distinct from a general '
  'approval decision — a single "changes requested" verdict (see '
  'approvals) can be accompanied by several of these. status is mutable '
  '(open -> resolved|cancelled), gated to RPC functions that log every '
  'transition to activity_events — same precedent as '
  'prams_workbook_imports.status.';

-- Every review-domain table needs to filter activity_events down to one
-- audio_item for the recording page''s unified timeline — cheaper and
-- clearer than parsing every row''s metadata jsonb for it.
alter table public.activity_events add column audio_item_id uuid references public.audio_items (id);
create index activity_events_audio_item_id_created_at_idx
  on public.activity_events (audio_item_id, created_at desc);

create index reviews_audio_item_id_idx on public.reviews (audio_item_id);
create index review_participants_review_id_idx on public.review_participants (review_id);
create index comment_threads_audio_item_id_idx on public.comment_threads (audio_item_id);
create index comment_threads_audio_version_id_idx on public.comment_threads (audio_version_id);
create index comments_thread_id_idx on public.comments (thread_id);
create index comment_edits_comment_id_idx on public.comment_edits (comment_id);
create index comment_thread_resolutions_thread_id_idx on public.comment_thread_resolutions (thread_id);
create index approvals_audio_item_id_idx on public.approvals (audio_item_id);
create index approvals_audio_version_id_idx on public.approvals (audio_version_id);
create index change_requests_audio_item_id_idx on public.change_requests (audio_item_id);
create index change_requests_audio_version_id_idx on public.change_requests (audio_version_id);

-- ── Helper functions (permission predicates) ────────────────────────────

-- Anyone with a genuine stake in reviewing: IMA admin/producer/reviewer,
-- Jet2 reviewer, or a studio uploader for their own project. Deliberately
-- excludes jet2_view_only (read/playback only, per the Phase 2C.2 brief).
create or replace function public.can_comment_on_review(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ima_manager()
    or public.current_role() in ('ima_reviewer', 'jet2_reviewer')
    or public.can_upload_audio_for_project(target_project_id);
$$;

comment on function public.can_comment_on_review(uuid) is
  'Who can comment/reply/resolve/reopen threads: IMA admin/producer/'
  'reviewer, Jet2 reviewer, or a studio user for their own project. Not '
  'jet2_view_only — playback and reading only.';

-- The narrower, decision-authority set: reviewers and IMA managers, never
-- a studio user (they can comment and reply, never approve — "Studio
-- Contributor: ... Cannot approve" per the brief) and never jet2_view_only.
create or replace function public.can_decide_review(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ima_manager()
    or (
      public.current_role() in ('ima_reviewer', 'jet2_reviewer')
      and public.can_access_project(target_project_id)
    );
$$;

comment on function public.can_decide_review(uuid) is
  'Who can approve / request changes / create or resolve change requests: '
  'IMA admin/producer/reviewer or Jet2 reviewer. Never a studio role '
  '("Cannot approve"), never jet2_view_only.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.reviews enable row level security;
alter table public.review_participants enable row level security;
alter table public.comment_threads enable row level security;
alter table public.comments enable row level security;
alter table public.comment_edits enable row level security;
alter table public.comment_thread_resolutions enable row level security;
alter table public.approvals enable row level security;
alter table public.change_requests enable row level security;

create policy reviews_select_accessible on public.reviews
  for select to authenticated
  using (public.can_access_project(public.audio_item_project_id(audio_item_id)));

-- Status transitions all go through the RPC functions in the next
-- migration (SECURITY INVOKER, so this same policy gates them); the
-- specific role required for a specific transition (e.g. archiving is
-- IMA-manager-only) is enforced inside each function body, since a single
-- table-level policy can't distinguish "which transition" from OLD/NEW
-- status alone. That's a deliberate, narrow exception to "RLS alone
-- decides" — see docs/review-engine.md.
create policy reviews_update_participants on public.reviews
  for update to authenticated
  using (public.can_comment_on_review(public.audio_item_project_id(audio_item_id)))
  with check (public.can_comment_on_review(public.audio_item_project_id(audio_item_id)));

create policy review_participants_select_accessible on public.review_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_participants.review_id
        and public.can_access_project(public.audio_item_project_id(r.audio_item_id))
    )
  );

create policy review_participants_insert_reviewers on public.review_participants
  for insert to authenticated
  with check (
    exists (
      select 1 from public.reviews r
      where r.id = review_participants.review_id
        and public.can_comment_on_review(public.audio_item_project_id(r.audio_item_id))
    )
  );

create policy comment_threads_select_accessible on public.comment_threads
  for select to authenticated
  using (public.can_access_project(public.audio_item_project_id(audio_item_id)));

create policy comment_threads_insert_reviewers on public.comment_threads
  for insert to authenticated
  with check (public.can_comment_on_review(public.audio_item_project_id(audio_item_id)));

create policy comments_select_accessible on public.comments
  for select to authenticated
  using (
    exists (
      select 1 from public.comment_threads t
      where t.id = comments.thread_id
        and public.can_access_project(public.audio_item_project_id(t.audio_item_id))
    )
  );

create policy comments_insert_reviewers on public.comments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.comment_threads t
      where t.id = comments.thread_id
        and public.can_comment_on_review(public.audio_item_project_id(t.audio_item_id))
    )
  );

-- Edit/soft-delete: author only, enforced directly here (not delegated to
-- the RPC) since "own comment only" is a simple, precise row-ownership
-- predicate RLS expresses cleanly.
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_user_id = (select id from public.user_profiles where auth_user_id = auth.uid()))
  with check (author_user_id = (select id from public.user_profiles where auth_user_id = auth.uid()));

create policy comment_edits_select_accessible on public.comment_edits
  for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      join public.comment_threads t on t.id = c.thread_id
      where c.id = comment_edits.comment_id
        and public.can_access_project(public.audio_item_project_id(t.audio_item_id))
    )
  );

create policy comment_edits_insert_own on public.comment_edits
  for insert to authenticated
  with check (
    exists (
      select 1 from public.comments c
      where c.id = comment_edits.comment_id
        and c.author_user_id = (select id from public.user_profiles where auth_user_id = auth.uid())
    )
  );

create policy comment_thread_resolutions_select_accessible on public.comment_thread_resolutions
  for select to authenticated
  using (
    exists (
      select 1 from public.comment_threads t
      where t.id = comment_thread_resolutions.thread_id
        and public.can_access_project(public.audio_item_project_id(t.audio_item_id))
    )
  );

create policy comment_thread_resolutions_insert_reviewers on public.comment_thread_resolutions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.comment_threads t
      where t.id = comment_thread_resolutions.thread_id
        and public.can_comment_on_review(public.audio_item_project_id(t.audio_item_id))
    )
  );

create policy approvals_select_accessible on public.approvals
  for select to authenticated
  using (public.can_access_project(public.audio_item_project_id(audio_item_id)));

create policy approvals_insert_deciders on public.approvals
  for insert to authenticated
  with check (public.can_decide_review(public.audio_item_project_id(audio_item_id)));

create policy change_requests_select_accessible on public.change_requests
  for select to authenticated
  using (public.can_access_project(public.audio_item_project_id(audio_item_id)));

create policy change_requests_insert_deciders on public.change_requests
  for insert to authenticated
  with check (public.can_decide_review(public.audio_item_project_id(audio_item_id)));

-- status/resolved_* columns move only via the resolve/cancel RPC functions.
create policy change_requests_update_deciders on public.change_requests
  for update to authenticated
  using (public.can_decide_review(public.audio_item_project_id(audio_item_id)))
  with check (public.can_decide_review(public.audio_item_project_id(audio_item_id)));

grant select, update on public.reviews to authenticated;
grant select, insert on public.review_participants to authenticated;
grant select, insert on public.comment_threads to authenticated;
grant select, insert, update on public.comments to authenticated;
grant select, insert on public.comment_edits to authenticated;
grant select, insert on public.comment_thread_resolutions to authenticated;
grant select, insert on public.approvals to authenticated;
grant select, insert, update on public.change_requests to authenticated;
