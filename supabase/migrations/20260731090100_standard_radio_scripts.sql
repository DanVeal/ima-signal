-- Phase 2B — Standard Radio: Script → Script variants → Script revisions → Ordered lines
--
-- Deliberately simpler than the PRAMS matrix model (no wording groups, no
-- membership, no shared-cell concept) — a Standard Radio variant's wording
-- belongs to exactly one revision, full stop. Shared helper functions
-- (can_access_project, is_ima_manager, set_updated_at) are reused from
-- Phase 2A; nothing here is forced into the PRAMS shape.

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.scripts is
  'A base creative concept for a Standard Radio project (e.g. "Winter Sun VO"). '
  'Its variants (destination/airport/offer/region) are scripts_variants rows.';

create trigger set_scripts_updated_at
  before update on public.scripts
  for each row execute function public.set_updated_at();

create or replace function public.check_project_is_standard_radio()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.projects where id = new.project_id and type = 'standard_radio'
  ) then
    raise exception 'scripts.project_id must reference a project with type = standard_radio';
  end if;
  return new;
end;
$$;

create trigger scripts_project_must_be_standard_radio
  before insert or update on public.scripts
  for each row execute function public.check_project_is_standard_radio();

create table public.script_variants (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts (id) on delete cascade,
  variant_code text not null,
  destination text,
  departure_airport text,
  offer_label text,
  region_label text,
  column_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, variant_code)
);

comment on table public.script_variants is
  'One destination/airport/offer/region variant of a script. Standard Radio''s '
  'equivalent of a PRAMS announcement variant, but with no shared-wording model.';

create trigger set_script_variants_updated_at
  before update on public.script_variants
  for each row execute function public.set_updated_at();

create table public.script_revisions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.script_variants (id) on delete cascade,
  revision_number int not null,
  is_approved_for_recording boolean not null default false,
  approved_by_user_id uuid references public.user_profiles (id),
  approved_at timestamptz,
  notes text,
  created_by_user_id uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  unique (variant_id, revision_number)
);

comment on table public.script_revisions is
  'One authored draft of a variant''s wording. Every change to a script''s '
  'wording creates a new revision — existing revisions are never mutated, '
  'mirroring the PRAMS wording model''s "never overwrite history" rule.';

create table public.script_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.script_revisions (id) on delete cascade,
  sort_order int not null,
  text text not null,
  unique (revision_id, sort_order)
);

comment on table public.script_lines is
  'Ordered spoken lines within one revision. Immutable once written — a '
  'wording change means a new revision with new lines, not an edit here.';

create index scripts_project_id_idx on public.scripts (project_id);
create index script_variants_script_id_idx on public.script_variants (script_id);
create index script_revisions_variant_id_idx on public.script_revisions (variant_id);
create index script_lines_revision_id_idx on public.script_lines (revision_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.scripts enable row level security;
alter table public.script_variants enable row level security;
alter table public.script_revisions enable row level security;
alter table public.script_lines enable row level security;

-- scripts: direct project_id column, same shape as every other project-scoped table.
create policy scripts_select_accessible on public.scripts
  for select to authenticated
  using (public.can_access_project(project_id));

create policy scripts_write_ima_managers on public.scripts
  for all to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

-- script_variants/revisions/lines have no project_id column of their own —
-- reuse can_access_project by walking the FK chain back to scripts.project_id,
-- exactly as PostgREST/RLS is meant to be used (no duplicated project_id
-- columns just to make policies simpler).
create policy script_variants_select_accessible on public.script_variants
  for select to authenticated
  using (
    exists (
      select 1 from public.scripts s
      where s.id = script_variants.script_id and public.can_access_project(s.project_id)
    )
  );

create policy script_variants_write_ima_managers on public.script_variants
  for all to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy script_revisions_select_accessible on public.script_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.script_variants v
      join public.scripts s on s.id = v.script_id
      where v.id = script_revisions.variant_id and public.can_access_project(s.project_id)
    )
  );

-- Revisions are insert-only once written (immutability is the point) — no
-- UPDATE policy at all, mirroring activity_events. Studio contributors will
-- gain revision-creation rights in a later phase (recording/re-record
-- workflow); Phase 2B's revisions are authored structurally (import/manual
-- script authoring), so IMA-manager-only for now.
create policy script_revisions_insert_ima_managers on public.script_revisions
  for insert to authenticated
  with check (public.is_ima_manager());

create policy script_lines_select_accessible on public.script_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.script_revisions r
      join public.script_variants v on v.id = r.variant_id
      join public.scripts s on s.id = v.script_id
      where r.id = script_lines.revision_id and public.can_access_project(s.project_id)
    )
  );

create policy script_lines_insert_ima_managers on public.script_lines
  for insert to authenticated
  with check (public.is_ima_manager());

grant select, insert, update on public.scripts to authenticated;
grant select, insert, update on public.script_variants to authenticated;
grant select, insert on public.script_revisions to authenticated;
grant select, insert on public.script_lines to authenticated;
