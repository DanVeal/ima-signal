-- Phase 2B — workbook imports: source records, diff/preview, and audit trail

create table public.prams_workbook_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  file_name text not null,
  file_hash text,
  imported_by_user_id uuid references public.user_profiles (id),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'discarded')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.prams_workbook_imports is
  'One workbook import attempt. summary holds the categorised change '
  'counts shown in the import preview (added/removed/renamed/wording/'
  'sharing/blank/row-order/section changes) — see the import service.';

create trigger prams_workbook_imports_project_must_be_prams
  before insert or update on public.prams_workbook_imports
  for each row execute function public.check_project_is_prams();

-- The detected diff, one row per change, generated during preview and kept
-- permanently after commit as the audit record of exactly what an import
-- changed — never deleted, even for a discarded import (status stays
-- 'discarded' but the row and its diffs remain queryable).
create table public.prams_workbook_import_diffs (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.prams_workbook_imports (id) on delete cascade,
  diff_type text not null check (diff_type in (
    'section_added', 'section_changed',
    'announcement_added', 'announcement_removed', 'announcement_renamed',
    'row_added', 'row_removed', 'row_reordered',
    'wording_changed', 'sharing_changed', 'blank_changed'
  )),
  section_slug text,
  row_key text,
  reference_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.prams_workbook_import_diffs is
  'One detected structural change. payload carries the before/after detail '
  '(e.g. {"before": "...", "after": "..."} for a rename or wording change).';

create index prams_workbook_import_diffs_import_id_idx
  on public.prams_workbook_import_diffs (import_id);
create index prams_workbook_imports_project_id_idx
  on public.prams_workbook_imports (project_id);

-- Backfill the FK now that prams_workbook_imports exists — these columns
-- were added as plain uuid in the prior migration so table creation order
-- didn't need to change.
alter table public.prams_matrix_rows
  add constraint prams_matrix_rows_source_import_id_fkey
  foreign key (source_import_id) references public.prams_workbook_imports (id);

alter table public.prams_matrix_cells
  add constraint prams_matrix_cells_source_import_id_fkey
  foreign key (source_import_id) references public.prams_workbook_imports (id);

alter table public.prams_wording_groups
  add constraint prams_wording_groups_source_import_id_fkey
  foreign key (source_import_id) references public.prams_workbook_imports (id);

-- Every structural table gains "which import last touched this", for full
-- import-source-and-timestamp traceability per the Phase 2B spec.
alter table public.prams_sections
  add column source_import_id uuid references public.prams_workbook_imports (id);

alter table public.prams_announcement_versions
  add column source_import_id uuid references public.prams_workbook_imports (id);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.prams_workbook_imports enable row level security;
alter table public.prams_workbook_import_diffs enable row level security;

create policy prams_workbook_imports_select_accessible on public.prams_workbook_imports
  for select to authenticated
  using (public.can_access_project(project_id));

-- Only IMA managers can start/confirm an import — matches every other
-- structural write in this schema.
create policy prams_workbook_imports_write_ima_managers on public.prams_workbook_imports
  for all to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy prams_workbook_import_diffs_select_accessible on public.prams_workbook_import_diffs
  for select to authenticated
  using (
    exists (
      select 1 from public.prams_workbook_imports imp
      where imp.id = prams_workbook_import_diffs.import_id
        and public.can_access_project(imp.project_id)
    )
  );

-- Diffs are insert-only once written (part of the audit trail) — no update
-- policy, matching activity_events and prams_wording_groups.
create policy prams_workbook_import_diffs_insert_ima_managers on public.prams_workbook_import_diffs
  for insert to authenticated
  with check (public.is_ima_manager());

grant select, insert, update on public.prams_workbook_imports to authenticated;
grant select, insert on public.prams_workbook_import_diffs to authenticated;
