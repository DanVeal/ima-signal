-- Standard Radio: base script + optional ALT insertions.
--
-- Not every recordable script is a self-contained "variant" of a shared
-- creative — some are a single base script (e.g. "NON FAM 30") with one or
-- more named alternate lines ("ALT 1", "ALT 2") that a producer may splice
-- in after one specific anchor line, depending on the market/run. The base
-- is authored once; the ALTs are their own optional text, never duplicated
-- into the base's own lines.

alter table public.script_revisions
  add column anchor_line_sort_order int;

comment on column public.script_revisions.anchor_line_sort_order is
  'The sort_order of the line in THIS revision after which this revision''s '
  'script_alts (if any) may be inserted. Null when the revision has no ALTs.';

create table public.script_alts (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.script_revisions (id) on delete cascade,
  label text not null,
  body text not null,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (revision_id, sort_order)
);

comment on table public.script_alts is
  'A named, optional insertion ("ALT 1", "ALT 2") for one revision''s single '
  'anchor point (script_revisions.anchor_line_sort_order). At most one ALT '
  'is used in any given final recording — never several from the same '
  'revision at once. Never mutated once written, matching script_lines.';

create index script_alts_revision_id_idx on public.script_alts (revision_id);

alter table public.script_alts enable row level security;

-- Same access shape as script_lines: walk revision -> variant -> script to
-- reach can_access_project; insert restricted to IMA managers (Phase 2B's
-- scripts are authored structurally, same rationale as script_lines).
create policy script_alts_select_accessible on public.script_alts
  for select to authenticated
  using (
    exists (
      select 1 from public.script_revisions r
      join public.script_variants v on v.id = r.variant_id
      join public.scripts s on s.id = v.script_id
      where r.id = script_alts.revision_id and public.can_access_project(s.project_id)
    )
  );

create policy script_alts_insert_ima_managers on public.script_alts
  for insert to authenticated
  with check (public.is_ima_manager());

grant select, insert on public.script_alts to authenticated;
