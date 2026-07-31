-- Phase 2C.1 — service_role grants for the audio tables, for the same
-- reason Phase 2B needed 20260731090500_phase2b_grants.sql: the blanket
-- `grant all on all tables in schema public to service_role` only applies
-- to tables that exist at the moment it runs.

grant all on public.audio_items to service_role;
grant all on public.audio_versions to service_role;
grant execute on function public.audio_subject_project_id(uuid, uuid) to authenticated, service_role;
grant execute on function public.audio_item_project_id(uuid) to authenticated, service_role;
grant execute on function public.can_upload_audio_for_project(uuid) to authenticated, service_role;
grant execute on function public.create_audio_version(uuid, text, text, bigint, text, numeric, text, int, int, int, text, jsonb) to service_role;
grant execute on function public.restore_audio_version(uuid) to service_role;
