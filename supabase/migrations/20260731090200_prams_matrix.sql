-- Phase 2B — the PRAMS matrix: rows, cells, explicit wording groups, membership
--
-- Core rule (per Phase 2 review): sharing is NEVER inferred from matching
-- text. Two cells with byte-identical wording remain independent unless the
-- workbook's authored merged-cell ranges (or a later explicit user action)
-- say otherwise. That fact is represented structurally: a "wording group"
-- is an authored text unit, "membership" says which cell(s) currently point
-- at it, and nothing anywhere compares `text` values to decide sharing.

-- One row per spoken-line position within a section (a matrix row). Scoped
-- to one update's section, like prams_sections itself — row_key is the
-- stable cross-update matching key (e.g. "line-1"), used by structural
-- comparison (see the comparison service) to find "the same row position"
-- in a different update without assuming identical row counts.
create table public.prams_matrix_rows (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.prams_sections (id) on delete cascade,
  row_key text not null,
  sort_order int not null,
  status text not null default 'active' check (status in ('active', 'removed')),
  source_import_id uuid, -- FK added once prams_workbook_imports exists (next migration)
  created_at timestamptz not null default now(),
  unique (section_id, row_key)
);

comment on table public.prams_matrix_rows is
  'One spoken-line position within a section. row_key is stable across '
  'workbook re-imports and across different updates (for comparison) — '
  'sort_order can change on re-import, row_key should not.';

-- The stable grid coordinate: (row, announcement_version). Created once per
-- intersection that exists in the workbook; never deleted, even if later
-- blanked or the announcement_version is marked removed — this is what
-- keeps history intact when a later import blanks or removes something.
create table public.prams_matrix_cells (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.prams_matrix_rows (id) on delete cascade,
  announcement_version_id uuid not null references public.prams_announcement_versions (id) on delete cascade,
  source_import_id uuid,
  created_at timestamptz not null default now(),
  unique (row_id, announcement_version_id)
);

comment on table public.prams_matrix_cells is
  'A grid coordinate. Its wording over time is entirely represented by which '
  'wording_group its CURRENT membership row points at — see '
  'prams_wording_group_members.is_current. The cell itself is never deleted.';

-- One authored text unit for one row. Immutable once created — "editing
-- shared wording" never mutates a row here, it creates a NEW group and
-- repoints affected cells'' membership (see the edit/override/remerge
-- functions in the next migration). text = null means an intentionally
-- blank cell, taken directly from the source workbook.
create table public.prams_wording_groups (
  id uuid primary key default gen_random_uuid(),
  row_id uuid not null references public.prams_matrix_rows (id) on delete cascade,
  text text,
  source text not null check (source in ('workbook_import', 'manual_shared_edit', 'override_split', 'remerge')),
  created_by_user_id uuid references public.user_profiles (id),
  source_import_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.prams_wording_groups is
  'One authored wording unit for one row — text is null for an intentional '
  'blank. Immutable: never updated in place. A row can have many of these '
  'over time (history); which one currently applies to which cell(s) lives '
  'entirely in prams_wording_group_members.is_current.';

-- Membership: which cell(s) a wording group currently (or historically)
-- covers. THIS is where sharing is represented — two cells share wording
-- if and only if their current membership rows point at the same group,
-- never because their text matches.
create table public.prams_wording_group_members (
  id uuid primary key default gen_random_uuid(),
  wording_group_id uuid not null references public.prams_wording_groups (id) on delete cascade,
  matrix_cell_id uuid not null references public.prams_matrix_cells (id) on delete cascade,
  is_current boolean not null default true,
  replaces_membership_id uuid references public.prams_wording_group_members (id),
  created_at timestamptz not null default now(),
  unique (wording_group_id, matrix_cell_id)
);

comment on table public.prams_wording_group_members is
  'is_current=true means this is the cell''s presently-active group '
  'assignment. replaces_membership_id chains to whatever this superseded, '
  'giving a full lineage for a cell across edits/overrides/re-merges '
  'without ever deleting the old row.';

-- Enforces "at most one current membership per cell" at the database level
-- — not just an application-layer convention.
create unique index prams_wording_group_members_one_current_per_cell
  on public.prams_wording_group_members (matrix_cell_id)
  where is_current;

create index prams_matrix_rows_section_id_idx on public.prams_matrix_rows (section_id);
create index prams_matrix_cells_row_id_idx on public.prams_matrix_cells (row_id);
create index prams_matrix_cells_announcement_version_id_idx
  on public.prams_matrix_cells (announcement_version_id);
create index prams_wording_groups_row_id_idx on public.prams_wording_groups (row_id);
create index prams_wording_group_members_wording_group_id_idx
  on public.prams_wording_group_members (wording_group_id);
create index prams_wording_group_members_matrix_cell_id_idx
  on public.prams_wording_group_members (matrix_cell_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Every policy here walks back to prams_sections.project_id via
-- can_access_project, the same pattern as the Standard Radio tables.

alter table public.prams_matrix_rows enable row level security;
alter table public.prams_matrix_cells enable row level security;
alter table public.prams_wording_groups enable row level security;
alter table public.prams_wording_group_members enable row level security;

create policy prams_matrix_rows_select_accessible on public.prams_matrix_rows
  for select to authenticated
  using (
    exists (
      select 1 from public.prams_sections sec
      where sec.id = prams_matrix_rows.section_id and public.can_access_project(sec.project_id)
    )
  );

create policy prams_matrix_rows_write_ima_managers on public.prams_matrix_rows
  for all to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy prams_matrix_cells_select_accessible on public.prams_matrix_cells
  for select to authenticated
  using (
    exists (
      select 1 from public.prams_matrix_rows r
      join public.prams_sections sec on sec.id = r.section_id
      where r.id = prams_matrix_cells.row_id and public.can_access_project(sec.project_id)
    )
  );

create policy prams_matrix_cells_write_ima_managers on public.prams_matrix_cells
  for all to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy prams_wording_groups_select_accessible on public.prams_wording_groups
  for select to authenticated
  using (
    exists (
      select 1 from public.prams_matrix_rows r
      join public.prams_sections sec on sec.id = r.section_id
      where r.id = prams_wording_groups.row_id and public.can_access_project(sec.project_id)
    )
  );

-- Wording groups are immutable once written (no UPDATE policy) — new
-- wording always means a new row, never an edit to an existing one.
create policy prams_wording_groups_insert_ima_managers on public.prams_wording_groups
  for insert to authenticated
  with check (public.is_ima_manager());

create policy prams_wording_group_members_select_accessible on public.prams_wording_group_members
  for select to authenticated
  using (
    exists (
      select 1 from public.prams_matrix_cells c
      join public.prams_matrix_rows r on r.id = c.row_id
      join public.prams_sections sec on sec.id = r.section_id
      where c.id = prams_wording_group_members.matrix_cell_id
        and public.can_access_project(sec.project_id)
    )
  );

-- Membership rows are inserted (new assignment) and can be updated ONLY to
-- flip is_current false → true is never valid app-side, but Postgres RLS
-- can't express "only this one column, only this direction" cleanly, so
-- membership retirement goes through the SECURITY INVOKER functions in the
-- next migration, which run as the calling user and are subject to this
-- same policy. Direct ad-hoc updates are still gated to IMA managers.
create policy prams_wording_group_members_insert_ima_managers on public.prams_wording_group_members
  for insert to authenticated
  with check (public.is_ima_manager());

create policy prams_wording_group_members_update_ima_managers on public.prams_wording_group_members
  for update to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

grant select, insert, update on public.prams_matrix_rows to authenticated;
grant select, insert, update on public.prams_matrix_cells to authenticated;
grant select, insert on public.prams_wording_groups to authenticated;
grant select, insert, update on public.prams_wording_group_members to authenticated;
