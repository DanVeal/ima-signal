-- Phase 2C.1 — Audio Foundation: the audio domain (audio_items, audio_versions)
--
-- An `audio_items` row is the *identity* of "the recording attached to X" —
-- exactly one of a Standard Radio `script_variants` row or a PRAMS
-- `prams_announcement_versions` row, never both, never neither once a file
-- exists. Standard Radio and PRAMS deliberately share this ONE audio system
-- rather than each getting their own, per the Phase 2C.1 brief.
--
-- An `audio_versions` row is one immutable uploaded file. Replacing a
-- recording NEVER overwrites a row — it inserts a new one and repoints
-- `audio_items.current_version_id`, exactly mirroring the
-- content/current-pointer split Phase 2B already established for PRAMS
-- wording (prams_wording_groups + prams_wording_group_members): the
-- immutable content lives in one place, "what's current" is a separate,
-- explicitly mutable pointer, so history is never at risk from the write
-- path that changes what's current.

create table public.audio_items (
  id uuid primary key default gen_random_uuid(),
  script_variant_id uuid references public.script_variants (id) on delete cascade,
  announcement_version_id uuid references public.prams_announcement_versions (id) on delete cascade,
  current_version_id uuid, -- FK added below, once audio_versions exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audio_items_exactly_one_subject check (
    (script_variant_id is not null and announcement_version_id is null)
    or (script_variant_id is null and announcement_version_id is not null)
  ),
  -- Nulls are distinct under a unique constraint, so this enforces "at most
  -- one audio_item per variant" / "...per announcement version" without
  -- blocking the other nullable column.
  unique (script_variant_id),
  unique (announcement_version_id)
);

comment on table public.audio_items is
  'The recording attached to exactly one Standard Radio script_variant OR '
  'one PRAMS announcement_version. Created lazily on first upload for that '
  'variant/version — most variants/versions have no audio_items row at all '
  'until someone uploads to them, which is exactly what "missing audio" '
  'means downstream.';

create trigger set_audio_items_updated_at
  before update on public.audio_items
  for each row execute function public.set_updated_at();

create table public.audio_versions (
  id uuid primary key default gen_random_uuid(),
  audio_item_id uuid not null references public.audio_items (id) on delete cascade,
  version_number int not null,
  uploaded_by_user_id uuid references public.user_profiles (id),
  original_filename text not null,
  storage_bucket text not null default 'audio-recordings',
  -- Not unique: restoring an older version deliberately reuses ITS
  -- storage_path (no new file — nothing was ever deleted from storage
  -- either), so two audio_versions rows can legitimately point at the same
  -- object. Uniqueness of the object itself is storage's own concern.
  storage_path text not null,
  file_size_bytes bigint not null,
  file_checksum text not null,
  duration_seconds numeric,
  codec text,
  sample_rate_hz int,
  channels int,
  bit_rate_bps int,
  container_format text,
  -- ~200 floats in [0, 1], one waveform peak per bucket — generated once at
  -- upload time from the real decoded audio, never regenerated afterwards
  -- (see docs/audio-foundation.md).
  waveform_peaks jsonb,
  -- Set only when this version was created by "restore older version" —
  -- points at the version being restored, so the restore is itself
  -- traceable, not indistinguishable from a fresh upload.
  restored_from_version_id uuid references public.audio_versions (id),
  created_at timestamptz not null default now(),
  unique (audio_item_id, version_number)
);

comment on table public.audio_versions is
  'One immutable uploaded file. Never updated, never deleted — replacing a '
  'recording (or restoring an older one) always inserts a new row here and '
  'repoints audio_items.current_version_id; this table itself has no UPDATE '
  'grant or policy at all, so "audio is immutable" holds at the database '
  'level, not just by convention.';

alter table public.audio_items
  add constraint audio_items_current_version_id_fkey
  foreign key (current_version_id) references public.audio_versions (id);

create index audio_items_script_variant_id_idx on public.audio_items (script_variant_id);
create index audio_items_announcement_version_id_idx on public.audio_items (announcement_version_id);
create index audio_versions_audio_item_id_idx on public.audio_versions (audio_item_id);
create index audio_versions_file_checksum_idx on public.audio_versions (file_checksum);
create index audio_versions_storage_path_idx on public.audio_versions (storage_path);

-- ── Helper functions ─────────────────────────────────────────────────────

-- Resolves the owning project_id directly from a (possibly not-yet-persisted)
-- subject pair — used in RLS WITH CHECK clauses on INSERT, where the
-- audio_items row doesn't exist to look up yet, only its NEW column values.
create or replace function public.audio_subject_project_id(
  p_script_variant_id uuid,
  p_announcement_version_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.project_id
      from public.script_variants sv
      join public.scripts s on s.id = sv.script_id
      where sv.id = p_script_variant_id
    ),
    (
      select av.project_id
      from public.prams_announcement_versions av
      where av.id = p_announcement_version_id
    )
  );
$$;

create or replace function public.audio_item_project_id(p_audio_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.audio_subject_project_id(ai.script_variant_id, ai.announcement_version_id)
  from public.audio_items ai
  where ai.id = p_audio_item_id;
$$;

comment on function public.audio_item_project_id(uuid) is
  'The project an audio_items row belongs to, via whichever subject (script '
  'variant or PRAMS announcement version) it is attached to. Every audio RLS '
  'policy is built from this, exactly like can_access_project is for every '
  'other project-scoped table.';

-- True for IMA managers everywhere, and for a studio only for its own
-- projects — the write-gate Phase 2A's RLS doc flagged as "Phase 2B adds
-- studio audio-upload write access" and deferred; this is that gate,
-- arriving in Phase 2C.1 where audio itself finally exists.
create or replace function public.can_upload_audio_for_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ima_manager()
    or (
      public.current_organisation_type() = 'studio'
      and exists (
        select 1 from public.projects pr
        where pr.id = target_project_id
          and pr.studio_organisation_id = public.current_organisation_id()
      )
    );
$$;

comment on function public.can_upload_audio_for_project(uuid) is
  'IMA admin/producer: any project. Studio admin/contributor: only a '
  'project assigned to their own studio organisation. Jet2 (any role): '
  'never — read/playback only.';

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.audio_items enable row level security;
alter table public.audio_versions enable row level security;

-- These three policies deliberately resolve the project via
-- audio_subject_project_id(script_variant_id, announcement_version_id) —
-- the row's OWN columns — rather than audio_item_project_id(id), which
-- re-queries audio_items by id. Re-querying the very table a policy is
-- attached to, from that policy, doesn't see a row inserted earlier in the
-- SAME command (observed concretely: INSERT ... RETURNING failed RLS for a
-- studio uploader even though the identical predicate evaluated true in a
-- separate statement) — using the row's own columns directly sidesteps
-- that self-reference entirely.
create policy audio_items_select_accessible on public.audio_items
  for select to authenticated
  using (public.can_access_project(public.audio_subject_project_id(script_variant_id, announcement_version_id)));

create policy audio_items_insert_uploaders on public.audio_items
  for insert to authenticated
  with check (
    public.can_upload_audio_for_project(
      public.audio_subject_project_id(script_variant_id, announcement_version_id)
    )
  );

-- UPDATE exists only so the create_audio_version/restore_audio_version RPCs
-- (next migration) can repoint current_version_id — an audio_items row's
-- subject (script_variant_id/announcement_version_id) is never changed by
-- anything, only current_version_id ever moves.
create policy audio_items_update_uploaders on public.audio_items
  for update to authenticated
  using (public.can_upload_audio_for_project(public.audio_subject_project_id(script_variant_id, announcement_version_id)))
  with check (public.can_upload_audio_for_project(public.audio_subject_project_id(script_variant_id, announcement_version_id)));

create policy audio_versions_select_accessible on public.audio_versions
  for select to authenticated
  using (public.can_access_project(public.audio_item_project_id(audio_item_id)));

-- Insert-only — no update policy at all, matching script_revisions and
-- prams_wording_groups. This is the actual enforcement of "audio is
-- immutable", not the application code that happens to only ever INSERT.
create policy audio_versions_insert_uploaders on public.audio_versions
  for insert to authenticated
  with check (public.can_upload_audio_for_project(public.audio_item_project_id(audio_item_id)));

grant select, insert, update on public.audio_items to authenticated;
grant select, insert on public.audio_versions to authenticated;
