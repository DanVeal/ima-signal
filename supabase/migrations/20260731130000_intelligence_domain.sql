-- Phase 2C.3 — Intelligence Engine: the AI domain
--
-- Signal assists, people decide: nothing in this schema ever mutates a
-- script, a comment, or a recording, and nothing here can approve or
-- reject anything — every table in this migration stores AI OBSERVATIONS
-- only (transcripts, comparisons, pronunciation flags, health ratings),
-- always alongside the exact recording version, transcript version, model
-- config, and timestamp that produced them, so every result is
-- reproducible and traceable. Approvals/change-requests (Phase 2C.2) are
-- the only things that ever move a review forward, and this phase never
-- touches them.
--
-- Same append-only philosophy as every previous phase:
--   - ai_jobs / reviews-style status column: a narrow, RPC-gated mutable
--     status (queued -> processing -> completed|failed|cancelled), every
--     transition logged to activity_events. Retried IN PLACE (attempts
--     increments) rather than spawning a new row per attempt, because a
--     job's own lifecycle is naturally one row with a history of states,
--     not new content to preserve.
--   - transcripts / transcript_versions: exactly the audio_items /
--     audio_versions shape — one identity row per audio_version, a
--     current-pointer, and immutable version rows underneath. Generating
--     a new transcript NEVER overwrites the old one; it creates version 2.
--   - comparison_results / comparison_findings, recording_health_snapshots
--     / recording_health_category_scores: parent + insert-only child rows,
--     the same split already used for comment_threads/comments and
--     prams_matrix_rows/cells.
--   - ai_model_metadata: a de-duplicated reference of exact model
--     configurations (provider/model/version/prompt version) — every
--     result row points at one, so "which exact model produced this" is
--     structural, never a guess.

create type public.ai_job_type as enum ('transcription', 'comparison', 'health');

create type public.ai_job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');

create type public.diff_classification as enum (
  'perfect',
  'minor_wording',
  'major_wording',
  'missing_phrase',
  'additional_phrase',
  'possible_pronunciation',
  'timing_issue',
  'confidence_issue'
);

create type public.health_rating as enum ('excellent', 'good', 'needs_review', 'attention_required');

create type public.health_category as enum (
  'transcript_match',
  'pronunciation',
  'timing',
  'noise_detection',
  'confidence',
  'completeness'
);

create type public.pronunciation_category as enum (
  'place_name',
  'airport_name',
  'destination_name',
  'brand_name',
  'person_name',
  'general'
);

-- ── AI Model Metadata ────────────────────────────────────────────────────

create table public.ai_model_metadata (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  model_version text,
  prompt_version text,
  created_at timestamptz not null default now(),
  unique (provider, model, model_version, prompt_version)
);

comment on table public.ai_model_metadata is
  'A de-duplicated reference of exact model configurations. Every AI result '
  'row (transcript_versions, comparison_results, pronunciation_findings, '
  'recording_health_snapshots) points at one, alongside the ai_job that '
  'used it — "what exact model produced this?" is always answerable.';

-- ── AI Job: the durable queue ────────────────────────────────────────────

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type public.ai_job_type not null,
  audio_version_id uuid not null references public.audio_versions (id),
  requested_by_user_id uuid references public.user_profiles (id),
  ai_model_metadata_id uuid references public.ai_model_metadata (id),
  status public.ai_job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  -- Set the instant a worker tick claims the row — a "processing" job
  -- whose claimed_at is implausibly old (see docs/intelligence-engine.md's
  -- Recovery section) is how a crashed worker's orphaned job is detected.
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.ai_jobs is
  'The durable queue. One row per unit of AI work, retried IN PLACE '
  '(attempts increments, status resets to queued) up to max_attempts — '
  'matching the reviews.status precedent: a narrow, RPC-gated mutable '
  'status column, every transition logged to activity_events.';

-- Idempotent enqueue: never more than one LIVE (queued/processing) job for
-- the same (audio_version, job_type) — requesting again while one is
-- already in flight returns the existing job rather than racing a
-- duplicate (see request_transcription in the next migration).
create unique index ai_jobs_one_live_per_target_idx
  on public.ai_jobs (audio_version_id, job_type)
  where status in ('queued', 'processing');

create index ai_jobs_status_created_at_idx on public.ai_jobs (status, created_at);
create index ai_jobs_audio_version_id_idx on public.ai_jobs (audio_version_id);

-- ── Transcripts ──────────────────────────────────────────────────────────

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  audio_version_id uuid not null unique references public.audio_versions (id),
  current_transcript_version_id uuid, -- FK added below, once transcript_versions exists
  created_at timestamptz not null default now()
);

comment on table public.transcripts is
  'One row per audio_version that has ever had a transcript requested. '
  'current_transcript_version_id is the one pointer that changes — exactly '
  'audio_items.current_version_id''s shape. Created by ensure_transcript() '
  'the moment the first transcription job for that version is requested.';

create table public.transcript_versions (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts (id) on delete cascade,
  version_number int not null,
  ai_job_id uuid not null references public.ai_jobs (id),
  ai_model_metadata_id uuid not null references public.ai_model_metadata (id),
  language text,
  full_text text not null,
  processing_duration_ms int,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (transcript_id, version_number)
);

comment on table public.transcript_versions is
  'One immutable transcription result. Regenerating NEVER overwrites this '
  'row — it inserts version N+1 and repoints transcripts.'
  'current_transcript_version_id, exactly like a new audio_version.';

alter table public.transcripts
  add constraint transcripts_current_transcript_version_id_fkey
  foreign key (current_transcript_version_id) references public.transcript_versions (id);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_version_id uuid not null references public.transcript_versions (id) on delete cascade,
  sort_order int not null,
  start_ms int not null,
  end_ms int not null,
  text text not null,
  confidence numeric,
  -- [{ word, start_ms, end_ms, confidence }, ...] where the provider
  -- supplies word-level timing; null when it doesn't.
  word_timings jsonb,
  unique (transcript_version_id, sort_order),
  constraint transcript_segments_end_after_start check (end_ms >= start_ms)
);

comment on table public.transcript_segments is
  'Timestamped transcript segments — the foundation for comparison and '
  'jump-to-audio navigation. Immutable once written.';

-- ── Comparison ───────────────────────────────────────────────────────────

create table public.comparison_results (
  id uuid primary key default gen_random_uuid(),
  audio_version_id uuid not null references public.audio_versions (id),
  transcript_version_id uuid not null references public.transcript_versions (id),
  script_revision_id uuid not null references public.script_revisions (id),
  ai_job_id uuid not null references public.ai_jobs (id),
  ai_model_metadata_id uuid not null references public.ai_model_metadata (id),
  -- Share of aligned units classified 'perfect' — a quick-glance number;
  -- the actual findings are what the reviewer acts on.
  match_ratio numeric not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.comparison_results is
  'One comparison run of exactly one (transcript_version, script_revision) '
  'pair. Never regenerated in place — a new script revision or a new '
  'transcript version means a new row, and the old comparison stays '
  'exactly as it was, still naming the version it was run against.';

create table public.comparison_findings (
  id uuid primary key default gen_random_uuid(),
  comparison_result_id uuid not null references public.comparison_results (id) on delete cascade,
  sort_order int not null,
  classification public.diff_classification not null,
  script_line_sort_order int,
  script_text text,
  transcript_segment_id uuid references public.transcript_segments (id),
  transcript_text text,
  start_ms int,
  end_ms int,
  confidence numeric,
  created_at timestamptz not null default now()
);

comment on table public.comparison_findings is
  'One aligned unit of the diff, in document order (sort_order) — a '
  'perfect match, a wording change, a missing/additional phrase, a '
  'possible pronunciation issue, a timing or confidence flag. '
  'script_line_sort_order / transcript_segment_id / start_ms are what '
  '"jump to script / transcript / audio" resolve against.';

-- ── Pronunciation ────────────────────────────────────────────────────────

create table public.pronunciation_findings (
  id uuid primary key default gen_random_uuid(),
  audio_version_id uuid not null references public.audio_versions (id),
  transcript_version_id uuid not null references public.transcript_versions (id),
  comparison_finding_id uuid references public.comparison_findings (id),
  transcript_segment_id uuid references public.transcript_segments (id),
  ai_job_id uuid not null references public.ai_jobs (id),
  ai_model_metadata_id uuid not null references public.ai_model_metadata (id),
  word text not null,
  category public.pronunciation_category not null,
  confidence numeric,
  start_ms int,
  end_ms int,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.pronunciation_findings is
  'A FLAG, never an assertion — "this word, spoken here, is worth a human '
  'listen" — derived from low transcript confidence on a word that looks '
  'like a name (place / airport / destination / brand / person). Produced '
  'as part of the comparison job, since it uses the same confidence + '
  'alignment data.';

-- ── Recording Health ─────────────────────────────────────────────────────

create table public.recording_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  audio_version_id uuid not null references public.audio_versions (id),
  transcript_version_id uuid references public.transcript_versions (id),
  comparison_result_id uuid references public.comparison_results (id),
  ai_job_id uuid not null references public.ai_jobs (id),
  ai_model_metadata_id uuid not null references public.ai_model_metadata (id),
  overall_rating public.health_rating not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.recording_health_snapshots is
  'A summary of findings, not a verdict — replaces "generic QC". Every '
  'snapshot names the exact audio/transcript/comparison it summarises. '
  'Never regenerated in place; a new snapshot is a new row, so a '
  'recording''s health over time (and over versions) stays fully visible.';

create table public.recording_health_category_scores (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.recording_health_snapshots (id) on delete cascade,
  category public.health_category not null,
  rating public.health_rating not null,
  summary text not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, category)
);

create index transcript_versions_transcript_id_idx on public.transcript_versions (transcript_id);
create index transcript_segments_transcript_version_id_idx on public.transcript_segments (transcript_version_id);
create index comparison_results_audio_version_id_idx on public.comparison_results (audio_version_id);
create index comparison_results_transcript_version_id_idx on public.comparison_results (transcript_version_id);
create index comparison_findings_comparison_result_id_idx on public.comparison_findings (comparison_result_id);
create index pronunciation_findings_audio_version_id_idx on public.pronunciation_findings (audio_version_id);
create index recording_health_snapshots_audio_version_id_idx on public.recording_health_snapshots (audio_version_id);
create index recording_health_category_scores_snapshot_id_idx on public.recording_health_category_scores (snapshot_id);

-- ── Helper functions ─────────────────────────────────────────────────────

-- The audio-domain equivalent of audio_item_project_id, one hop further —
-- every RLS policy below and every "can this project's people see/request
-- AI work on this recording?" check is built from this.
create or replace function public.audio_version_project_id(p_audio_version_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.audio_item_project_id(av.audio_item_id)
  from public.audio_versions av
  where av.id = p_audio_version_id;
$$;

comment on function public.audio_version_project_id(uuid) is
  'The project an audio_versions row belongs to, via its audio_item''s '
  'subject. Every Intelligence Engine RLS policy is built from this.';

-- Who can REQUEST AI work: IMA admin/producer anywhere, a studio only for
-- their own project. Deliberately the same set as can_upload_audio_for_
-- project — "IMA Producer: Generate transcripts... Studio Contributor:
-- Generate transcripts... Jet2 Reviewer: View only, Cannot regenerate" per
-- the Phase 2C.3 brief. Viewing results uses the existing can_access_
-- project — everyone with project access sees AI output, generation is
-- the narrower gate.
create or replace function public.can_generate_ai_work(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ima_manager() or public.can_upload_audio_for_project(target_project_id);
$$;

comment on function public.can_generate_ai_work(uuid) is
  'IMA admin/producer anywhere, studio admin/contributor for their own '
  'project. Never Jet2 (any role), never an IMA reviewer — matches the '
  'Phase 2C.3 permission brief exactly.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.ai_model_metadata enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcript_versions enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.comparison_results enable row level security;
alter table public.comparison_findings enable row level security;
alter table public.pronunciation_findings enable row level security;
alter table public.recording_health_snapshots enable row level security;
alter table public.recording_health_category_scores enable row level security;

-- Low-sensitivity reference data — every authenticated user can read it,
-- same treatment as organisations/user_profiles in Phase 2A. Only the
-- worker (service_role) ever writes it.
create policy ai_model_metadata_select_authenticated on public.ai_model_metadata
  for select to authenticated using (true);

create policy ai_jobs_select_accessible on public.ai_jobs
  for select to authenticated
  using (public.can_access_project(public.audio_version_project_id(audio_version_id)));

-- Enqueueing is the ONE moment a real user's permission is actually
-- checked for AI work — everything after that (the worker's writes) runs
-- as service_role. request_transcription/retry_ai_job (next migration)
-- insert through this policy.
create policy ai_jobs_insert_generators on public.ai_jobs
  for insert to authenticated
  with check (public.can_generate_ai_work(public.audio_version_project_id(audio_version_id)));

-- Cancel/retry go through this — the RPC functions additionally check the
-- job's own status (only a queued job can be cancelled) since that's a
-- per-transition rule RLS alone can't express, same documented exception
-- pattern as archive_review in Phase 2C.2.
create policy ai_jobs_update_generators on public.ai_jobs
  for update to authenticated
  using (public.can_generate_ai_work(public.audio_version_project_id(audio_version_id)))
  with check (public.can_generate_ai_work(public.audio_version_project_id(audio_version_id)));

create policy transcripts_select_accessible on public.transcripts
  for select to authenticated
  using (public.can_access_project(public.audio_version_project_id(audio_version_id)));

create policy transcript_versions_select_accessible on public.transcript_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.transcripts t
      where t.id = transcript_versions.transcript_id
        and public.can_access_project(public.audio_version_project_id(t.audio_version_id))
    )
  );

create policy transcript_segments_select_accessible on public.transcript_segments
  for select to authenticated
  using (
    exists (
      select 1 from public.transcript_versions tv
      join public.transcripts t on t.id = tv.transcript_id
      where tv.id = transcript_segments.transcript_version_id
        and public.can_access_project(public.audio_version_project_id(t.audio_version_id))
    )
  );

create policy comparison_results_select_accessible on public.comparison_results
  for select to authenticated
  using (public.can_access_project(public.audio_version_project_id(audio_version_id)));

create policy comparison_findings_select_accessible on public.comparison_findings
  for select to authenticated
  using (
    exists (
      select 1 from public.comparison_results cr
      where cr.id = comparison_findings.comparison_result_id
        and public.can_access_project(public.audio_version_project_id(cr.audio_version_id))
    )
  );

create policy pronunciation_findings_select_accessible on public.pronunciation_findings
  for select to authenticated
  using (public.can_access_project(public.audio_version_project_id(audio_version_id)));

create policy recording_health_snapshots_select_accessible on public.recording_health_snapshots
  for select to authenticated
  using (public.can_access_project(public.audio_version_project_id(audio_version_id)));

create policy recording_health_category_scores_select_accessible on public.recording_health_category_scores
  for select to authenticated
  using (
    exists (
      select 1 from public.recording_health_snapshots s
      where s.id = recording_health_category_scores.snapshot_id
        and public.can_access_project(public.audio_version_project_id(s.audio_version_id))
    )
  );

grant select on public.ai_model_metadata to authenticated;
grant select, insert, update on public.ai_jobs to authenticated;
grant select on public.transcripts to authenticated;
grant select on public.transcript_versions to authenticated;
grant select on public.transcript_segments to authenticated;
grant select on public.comparison_results to authenticated;
grant select on public.comparison_findings to authenticated;
grant select on public.pronunciation_findings to authenticated;
grant select on public.recording_health_snapshots to authenticated;
grant select on public.recording_health_category_scores to authenticated;
