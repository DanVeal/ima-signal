-- Phase 2C.3 — service_role grants for the Intelligence Engine tables, same
-- reason as every previous phase's trailing grants migration: the blanket
-- `grant all on all tables in schema public to service_role` only applies
-- to tables that exist at the moment it runs.
--
-- The worker-facing functions (claim/record/fail) are granted to
-- service_role ONLY — never authenticated — because they run exclusively
-- inside src/lib/ai/worker.ts's service-role client and bypass RLS
-- entirely; the real permission check already happened at
-- request_transcription's INSERT (Phase 2C.3's ai_jobs_insert_generators
-- policy).

grant all on public.ai_model_metadata to service_role;
grant all on public.ai_jobs to service_role;
grant all on public.transcripts to service_role;
grant all on public.transcript_versions to service_role;
grant all on public.transcript_segments to service_role;
grant all on public.comparison_results to service_role;
grant all on public.comparison_findings to service_role;
grant all on public.pronunciation_findings to service_role;
grant all on public.recording_health_snapshots to service_role;
grant all on public.recording_health_category_scores to service_role;

grant execute on function public.audio_version_project_id(uuid) to authenticated, service_role;
grant execute on function public.can_generate_ai_work(uuid) to authenticated, service_role;
grant execute on function public.ensure_ai_model_metadata(text, text, text, text) to authenticated, service_role;
grant execute on function public.ensure_transcript(uuid) to authenticated, service_role;
grant execute on function public.request_transcription(uuid) to service_role;
grant execute on function public.request_bulk_transcription(uuid[]) to service_role;
grant execute on function public.cancel_ai_job(uuid) to service_role;
grant execute on function public.retry_ai_job(uuid) to service_role;

grant execute on function public.claim_next_ai_jobs(public.ai_job_type, int) to service_role;
grant execute on function public.fail_ai_job(uuid, text) to service_role;
grant execute on function public.record_transcript_result(uuid, text, text, int, jsonb) to service_role;
grant execute on function public.record_comparison_result(uuid, uuid, uuid, numeric, jsonb, jsonb) to service_role;
grant execute on function public.record_health_snapshot(uuid, uuid, uuid, public.health_rating, jsonb) to service_role;
