-- Phase 2B pre-checks (required by review before any new structural work):
--
-- 1. activity_events must be append-only at the DATABASE level, not just via
--    RLS. RLS alone is insufficient: service_role has rolbypassrls = true in
--    Postgres (confirmed against the running local stack), so it bypasses
--    every RLS policy entirely — the absence of an UPDATE/DELETE policy does
--    NOT stop a service-role connection from mutating this table. A trigger
--    fires for every role regardless of RLS bypass, so that's where the real
--    guarantee has to live.
--
-- 2. PRAMS reference codes must be normalised BEFORE the uniqueness check,
--    so " 081a.j2 " and "081A.J2" can never become two rows.
--
-- 3. The original as-imported value must still be retrievable when it
--    differs from the canonical (normalised) value, for display and audit.

-- ── 1. activity_events: append-only at the database level ──────────────
create or replace function public.reject_activity_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_events is append-only: % is not permitted (row id %)',
    TG_OP, coalesce(old.id, new.id);
end;
$$;

comment on function public.reject_activity_events_mutation() is
  'Fires for every role, including service_role (which bypasses RLS entirely) '
  '— this is what actually makes activity_events append-only, not the '
  'absence of an UPDATE/DELETE policy alone.';

create trigger activity_events_reject_update
  before update on public.activity_events
  for each row execute function public.reject_activity_events_mutation();

create trigger activity_events_reject_delete
  before delete on public.activity_events
  for each row execute function public.reject_activity_events_mutation();

-- ── 2 & 3. PRAMS reference code normalisation + original-value retention ──
create or replace function public.normalize_reference_code(input text)
returns text
language sql
immutable
as $$
  select upper(trim(regexp_replace(input, '\s+', ' ', 'g')));
$$;

comment on function public.normalize_reference_code(text) is
  'Canonical form used for uniqueness and cross-table matching: trims '
  'whitespace, collapses internal runs of whitespace to one space, '
  'uppercases. " 081a.j2 " and "081A.J2" normalise to the same value.';

alter table public.prams_announcements
  add column original_reference_code text;

comment on column public.prams_announcements.original_reference_code is
  'The reference code exactly as first imported, before normalisation — '
  'set once at creation, never overwritten. Null if it was already in '
  'canonical form. Display this alongside reference_code when they differ.';

create or replace function public.normalize_prams_announcement_reference_code()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' and new.original_reference_code is null then
    new.original_reference_code := new.reference_code;
  end if;
  new.reference_code := public.normalize_reference_code(new.reference_code);
  if new.original_reference_code = new.reference_code then
    new.original_reference_code := null;
  end if;
  return new;
end;
$$;

-- BEFORE ROW triggers run before the UNIQUE constraint is checked, so this
-- is what makes normalisation happen "before uniqueness checks" rather than
-- as an app-layer convention a caller could bypass.
create trigger prams_announcements_normalize_reference_code
  before insert or update of reference_code on public.prams_announcements
  for each row execute function public.normalize_prams_announcement_reference_code();

-- The per-update equivalent: what THIS update's workbook literally said for
-- this announcement, which may differ from the registry's canonical value
-- (e.g. a later update's workbook has different casing, or a typo that
-- doesn't warrant treating it as a different announcement — see the Phase
-- 2B docs on reference-code-changed handling during import).
alter table public.prams_announcement_versions
  add column reference_code_raw text;

comment on column public.prams_announcement_versions.reference_code_raw is
  'The reference code exactly as it appeared in this update''s imported '
  'workbook, if it differs from the registry''s canonical reference_code. '
  'Null when they match.';
