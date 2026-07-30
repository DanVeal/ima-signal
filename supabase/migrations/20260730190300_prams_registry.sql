-- Phase 2A — PRAMS update records and the global announcement registry
--
-- Architecture decision (per Phase 2 review): a PRAMS announcement reference
-- such as "081A.J2" has one persistent master identity that survives across
-- PRAMS updates (July 2026, October 2026, ...). Everything about *how that
-- announcement behaves in one specific update* — its title as imported,
-- which section it sits in, its column position, whether it's still part of
-- the current update — is a separate, per-update row. Nothing from one
-- update carries into another automatically; a later Phase 2B import
-- workflow is what explicitly links a new update's row back to the existing
-- global identity (or flags it for manual confirmation — see the plan doc).

-- One row per PRAMS project (type = 'prams'), holding the update-specific
-- metadata that doesn't belong on the generic `projects` table. Split out
-- (rather than adding prams-only columns to `projects`) so `projects` stays
-- a clean shell shared by both project types, matching how the frontend
-- already treats "PRAMS — July 2026 Update" as one project row with its own
-- identity, while still giving PRAMS updates a place to record their own
-- lineage (e.g. which update superseded this one).
create table public.prams_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  update_label text not null,
  workbook_source_label text,
  status public.prams_update_status not null default 'draft',
  effective_from date,
  superseded_by_update_id uuid references public.prams_updates (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_prams_updates_updated_at
  before update on public.prams_updates
  for each row execute function public.set_updated_at();

-- Enforce project_id actually points at a `prams`-typed project — a
-- Standard Radio project must never gain a prams_updates row.
create or replace function public.check_project_is_prams()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.projects where id = new.project_id and type = 'prams'
  ) then
    raise exception 'prams_updates.project_id must reference a project with type = prams';
  end if;
  return new;
end;
$$;

create trigger prams_updates_project_must_be_prams
  before insert or update on public.prams_updates
  for each row execute function public.check_project_is_prams();

-- THE GLOBAL REGISTRY. reference_code is the stable identity — see the
-- module comment above. current_title/current_tags are editable metadata:
-- changing them never changes identity. There is no project_id here on
-- purpose; this table is not scoped to any one update.
create table public.prams_announcements (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  current_title text not null,
  current_tags jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.prams_announcements is
  'Global PRAMS announcement identity registry, keyed by reference_code. '
  'Persists across updates. Title/tags are editable metadata, not identity — '
  'see the Phase 2A architecture decision on reference-code stability.';

create trigger set_prams_announcements_updated_at
  before update on public.prams_announcements
  for each row execute function public.set_updated_at();

-- One row per section per update (per project). Sections are NOT global —
-- "Boarding" in the July update and "Boarding" in the October update are
-- two different rows, linked only by matching `slug`, so a future
-- cross-release comparison can find them without assuming the two updates'
-- section structures are identical.
create table public.prams_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order int not null,
  available boolean not null default false,
  source_sheet_name text,
  unique (project_id, slug)
);

comment on table public.prams_sections is
  'Announcement sections (Boarding, Safety Demonstration, ...), scoped to '
  'one PRAMS update. available=false means not yet transcribed from the '
  'source workbook — never fabricate content for such a section.';

create trigger prams_sections_project_must_be_prams
  before insert or update on public.prams_sections
  for each row execute function public.check_project_is_prams();

-- The per-update membership record: binds a global announcement identity
-- into one specific update's structure. This is what "Each PRAMS update
-- creates a version-specific announcement record beneath that master
-- identity" means concretely. Phase 2B adds a `script_id` column here (once
-- `scripts`/`audio_items` exist) linking this membership to its reviewable
-- item for that update — deliberately not created yet (see Known
-- Limitations in the Phase 2A docs).
create table public.prams_announcement_versions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.prams_announcements (id),
  project_id uuid not null references public.projects (id) on delete cascade,
  section_id uuid references public.prams_sections (id),
  title_at_import text not null,
  tags jsonb not null default '[]'::jsonb,
  column_order int,
  status public.prams_announcement_version_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, announcement_id)
);

comment on table public.prams_announcement_versions is
  'One row per (announcement, update). "removed" means this update''s '
  'workbook no longer contains this reference — the row is kept, never '
  'deleted, so history stays queryable (see workbook re-import safety rule).';

create trigger set_prams_announcement_versions_updated_at
  before update on public.prams_announcement_versions
  for each row execute function public.set_updated_at();

create trigger prams_announcement_versions_project_must_be_prams
  before insert or update on public.prams_announcement_versions
  for each row execute function public.check_project_is_prams();

create index prams_sections_project_id_idx on public.prams_sections (project_id);
create index prams_announcement_versions_project_id_idx
  on public.prams_announcement_versions (project_id);
create index prams_announcement_versions_announcement_id_idx
  on public.prams_announcement_versions (announcement_id);
create index prams_announcement_versions_section_id_idx
  on public.prams_announcement_versions (section_id);

alter table public.prams_updates enable row level security;
alter table public.prams_announcements enable row level security;
alter table public.prams_sections enable row level security;
alter table public.prams_announcement_versions enable row level security;

create policy prams_updates_select_accessible on public.prams_updates
  for select
  to authenticated
  using (public.can_access_project(project_id));

create policy prams_updates_write_ima_managers on public.prams_updates
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

-- The global registry is not project-scoped, so can_access_project doesn't
-- apply. It is reference data only (codes/titles), readable by every
-- authenticated role — including studio, who will need it in Phase 2B to
-- match uploaded filenames against reference codes.
create policy prams_announcements_select_authenticated on public.prams_announcements
  for select
  to authenticated
  using (true);

create policy prams_announcements_write_ima_managers on public.prams_announcements
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy prams_sections_select_accessible on public.prams_sections
  for select
  to authenticated
  using (public.can_access_project(project_id));

create policy prams_sections_write_ima_managers on public.prams_sections
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy prams_announcement_versions_select_accessible on public.prams_announcement_versions
  for select
  to authenticated
  using (public.can_access_project(project_id));

create policy prams_announcement_versions_write_ima_managers on public.prams_announcement_versions
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());
