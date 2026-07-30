-- Phase 2A — table privileges for the Data API roles
--
-- Newer Supabase projects do not auto-expose new tables to `anon`/
-- `authenticated`/`service_role` (see supabase/config.toml's
-- `auto_expose_new_tables` comment) — RLS policies only restrict rows, the
-- underlying GRANT must separately permit the operation at all. `anon` gets
-- nothing in this schema: every table requires a signed-in user.

grant usage on schema public to authenticated, service_role;

grant select on public.organisations to authenticated;
grant select, update on public.user_profiles to authenticated;

grant select on public.campaigns to authenticated;
grant insert, update, delete on public.campaigns to authenticated;

grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_jet2_reviewers to authenticated;

grant select, insert, update on public.prams_updates to authenticated;
grant select, insert, update on public.prams_announcements to authenticated;
grant select, insert, update on public.prams_sections to authenticated;
grant select, insert, update on public.prams_announcement_versions to authenticated;

grant select, insert on public.activity_events to authenticated;

-- service_role bypasses RLS entirely (Supabase convention) but still needs
-- table-level grants; give it everything for seeding/admin/back-office use.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
