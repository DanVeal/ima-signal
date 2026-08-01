-- Release Candidate 1 — Organisation management.
--
-- Organisations are archived, never hard-deleted (same lifecycle model as
-- users — see 20260801000000_admin_area.sql). Writes go through the Admin
-- area's service-role actions (same pattern as user management), gated by
-- an app-level is_ima_admin() check rather than a new RLS write policy —
-- organisations has no self-serve write policy at all today (Phase 2A:
-- "Writes are service-role only"), so this doesn't change that shape.

alter table public.organisations add column is_active boolean not null default true;

comment on column public.organisations.is_active is
  'False once an IMA Admin archives the organisation. Never delete a row — existing users/campaigns/projects referencing it must keep resolving. Archived organisations are excluded from "pick an organisation" pickers for new users/campaigns/projects.';
