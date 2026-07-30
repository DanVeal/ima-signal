-- Phase 2A — extensions and enum types
--
-- Foundation migration: extensions and the fixed-vocabulary enums used across
-- every other Phase 2A table. Enums (not free text + CHECK) are used
-- deliberately where the value set is closed and stable, so the generated
-- TypeScript types carry real unions instead of `string`.

create extension if not exists pgcrypto with schema extensions;

create type public.organisation_type as enum ('ima', 'jet2', 'studio');

create type public.user_role as enum (
  'ima_admin',
  'ima_producer',
  'ima_reviewer',
  'jet2_reviewer',
  'jet2_view_only',
  'studio_admin',
  'studio_contributor'
);

create type public.project_type as enum ('standard_radio', 'prams');

-- Mirrors the frontend's ProjectStatus union exactly (src/types/domain.ts).
create type public.project_status as enum (
  'draft_script',
  'ready_to_record',
  'studio_recording',
  'ready_for_ima_review',
  'ima_changes_requested',
  'ready_for_jet2_review',
  'jet2_changes_requested',
  'approved',
  'delivered'
);

create type public.prams_update_status as enum ('draft', 'active', 'archived');

create type public.prams_announcement_version_status as enum ('active', 'removed');

-- Shared trigger: keep `updated_at` current on every UPDATE, for every table
-- that has the column. Cheap, generic, and avoids repeating this in the app.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
