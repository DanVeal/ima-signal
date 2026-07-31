-- Phase 2C.3 — Intelligence Engine: RPC functions
--
-- Two tiers, split by who calls them:
--   - authenticated-facing (request_transcription, cancel_ai_job,
--     retry_ai_job): SECURITY INVOKER, same as every Phase 2C.2 RPC — the
--     RLS policies from the previous migration are the real gate.
--   - worker-facing (claim_next_ai_job, record_*, fail_ai_job): called
--     ONLY by the background worker's service_role client (src/lib/ai/
--     worker.ts), which bypasses RLS entirely by design — a background
--     tick has no "signed-in user" to gate against. Granted to
--     service_role only, never authenticated (see the trailing grants
--     migration).

-- ── Shared helpers ───────────────────────────────────────────────────────

create or replace function public.ensure_ai_model_metadata(
  p_provider text, p_model text, p_model_version text, p_prompt_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.ai_model_metadata (provider, model, model_version, prompt_version)
  values (p_provider, p_model, p_model_version, p_prompt_version)
  on conflict (provider, model, model_version, prompt_version) do nothing;

  select id into v_id from public.ai_model_metadata
   where provider = p_provider and model = p_model
     and model_version is not distinct from p_model_version
     and prompt_version is not distinct from p_prompt_version;
  return v_id;
end;
$$;

-- SECURITY DEFINER for the same reason create_review_for_audio_item is in
-- Phase 2C.2 (and initially wasn't, which broke real uploads — see
-- docs/review-engine.md): authenticated has no INSERT grant on
-- `transcripts` (only the system should ever create one), so a plain
-- invoker call from request_transcription would fail with permission
-- denied for any real signed-in user.
create or replace function public.ensure_transcript(p_audio_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.transcripts (audio_version_id)
  values (p_audio_version_id)
  on conflict (audio_version_id) do nothing;

  select id into v_id from public.transcripts where audio_version_id = p_audio_version_id;
  return v_id;
end;
$$;

-- ── Authenticated-facing: enqueue / cancel / retry ───────────────────────

-- One entry point for "generate a transcript", whether this is the very
-- first attempt for this recording version or a deliberate regeneration.
-- Idempotent: if a job is already queued/processing for this version, the
-- unique partial index (ai_jobs_one_live_per_target_idx) blocks a second
-- INSERT — caught here and the existing live job's id is returned instead
-- of raising, so a caller double-clicking "Transcribe" is a no-op, not an
-- error.
create or replace function public.request_transcription(p_audio_version_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_transcript_id uuid;
  v_job_id uuid;
  v_model_id uuid;
  v_actor_id uuid;
  v_project_id uuid;
  v_audio_item_id uuid;
  v_is_regeneration boolean;
begin
  v_actor_id := public.current_user_profile_id();
  v_transcript_id := public.ensure_transcript(p_audio_version_id);

  select (current_transcript_version_id is not null) into v_is_regeneration
    from public.transcripts where id = v_transcript_id;

  v_model_id := public.ensure_ai_model_metadata('elevenlabs', 'scribe_v1', null, null);

  begin
    insert into public.ai_jobs (job_type, audio_version_id, requested_by_user_id, ai_model_metadata_id)
    values ('transcription', p_audio_version_id, v_actor_id, v_model_id)
    returning id into v_job_id;
  exception when unique_violation then
    select id into v_job_id from public.ai_jobs
     where audio_version_id = p_audio_version_id and job_type = 'transcription'
       and status in ('queued', 'processing')
     order by created_at desc limit 1;
    return v_job_id;
  end;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = p_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'ai_job', case when v_is_regeneration then 'transcript regeneration requested' else 'transcript requested' end,
    case when v_is_regeneration then 'transcript_regenerated' else 'transcript_requested' end,
    jsonb_build_object('ai_job_id', v_job_id, 'audio_version_id', p_audio_version_id)
  );

  return v_job_id;
end;
$$;

grant execute on function public.request_transcription(uuid) to authenticated;

-- Bulk entry point — "Support hundreds of recordings": one call per
-- version, same idempotency guarantee as the single-item path, returning
-- every resulting (or already-live) job id so the caller can show
-- Queued/already-in-flight per row without a second round trip.
create or replace function public.request_bulk_transcription(p_audio_version_ids uuid[])
returns table (audio_version_id uuid, ai_job_id uuid)
language plpgsql
as $$
declare
  v_id uuid;
begin
  foreach v_id in array p_audio_version_ids loop
    audio_version_id := v_id;
    ai_job_id := public.request_transcription(v_id);
    return next;
  end loop;
end;
$$;

grant execute on function public.request_bulk_transcription(uuid[]) to authenticated;

create or replace function public.cancel_ai_job(p_job_id uuid)
returns void
language plpgsql
as $$
declare
  v_status public.ai_job_status;
  v_audio_version_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_row_count int;
begin
  select status, audio_version_id into v_status, v_audio_version_id from public.ai_jobs where id = p_job_id;
  if v_audio_version_id is null then
    raise exception 'ai job % not found', p_job_id;
  end if;
  if v_status <> 'queued' then
    raise exception 'only a queued job can be cancelled (current status: %)', v_status;
  end if;

  v_actor_id := public.current_user_profile_id();

  update public.ai_jobs set status = 'cancelled', cancelled_at = now()
   where id = p_job_id and status = 'queued';
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'not permitted to cancel this job';
  end if;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'ai_job', 'AI job cancelled', 'ai_job_cancelled', jsonb_build_object('ai_job_id', p_job_id)
  );
end;
$$;

grant execute on function public.cancel_ai_job(uuid) to authenticated;

-- Manual retry always re-queues regardless of max_attempts — a person
-- deliberately asking for another attempt overrides the automatic-retry
-- cap (which only governs the worker's own failure-triggered retries).
create or replace function public.retry_ai_job(p_job_id uuid)
returns void
language plpgsql
as $$
declare
  v_status public.ai_job_status;
  v_audio_version_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_row_count int;
begin
  select status, audio_version_id into v_status, v_audio_version_id from public.ai_jobs where id = p_job_id;
  if v_audio_version_id is null then
    raise exception 'ai job % not found', p_job_id;
  end if;
  if v_status <> 'failed' then
    raise exception 'only a failed job can be retried (current status: %)', v_status;
  end if;

  v_actor_id := public.current_user_profile_id();

  -- attempts resets to 0 too: a human deliberately asking for another
  -- attempt is a fresh budget, not a continuation of the automatic
  -- retry count that already exhausted itself.
  update public.ai_jobs
     set status = 'queued', attempts = 0, last_error = null, claimed_at = null, started_at = null, completed_at = null
   where id = p_job_id and status = 'failed';
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'not permitted to retry this job';
  end if;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'ai_job', 'AI job retried', 'ai_job_retried', jsonb_build_object('ai_job_id', p_job_id)
  );
end;
$$;

grant execute on function public.retry_ai_job(uuid) to authenticated;

-- ── Worker-facing: claim, complete, fail ─────────────────────────────────
-- Every function below is called exclusively by src/lib/ai/worker.ts using
-- the service-role client — granted to service_role only (next
-- migration). RLS is never in play for these; the permission check
-- already happened at request_transcription's INSERT.

create or replace function public.claim_next_ai_jobs(p_job_type public.ai_job_type, p_limit int default 5)
returns setof public.ai_jobs
language plpgsql
as $$
begin
  return query
  update public.ai_jobs
     set status = 'processing',
         claimed_at = now(),
         started_at = coalesce(started_at, now()),
         attempts = attempts + 1
   where id in (
     select id from public.ai_jobs
      where status = 'queued' and job_type = p_job_type
      order by created_at
      limit p_limit
      for update skip locked
   )
   returning *;
end;
$$;

comment on function public.claim_next_ai_jobs(public.ai_job_type, int) is
  'Atomic claim via FOR UPDATE SKIP LOCKED — safe for more than one worker '
  'tick to call concurrently without double-processing the same job.';

create or replace function public.fail_ai_job(p_job_id uuid, p_error text)
returns void
language plpgsql
as $$
declare
  v_attempts int;
  v_max_attempts int;
  v_job_type public.ai_job_type;
  v_audio_version_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_next_status public.ai_job_status;
  v_action text;
begin
  select attempts, max_attempts, job_type, audio_version_id
    into v_attempts, v_max_attempts, v_job_type, v_audio_version_id
    from public.ai_jobs where id = p_job_id;

  v_next_status := case when v_attempts >= v_max_attempts then 'failed' else 'queued' end;

  update public.ai_jobs
     set status = v_next_status,
         last_error = p_error,
         completed_at = case when v_next_status = 'failed' then now() else null end,
         claimed_at = null
   where id = p_job_id;

  -- Only log a terminal failure to the activity feed — an automatic retry
  -- that's about to run again isn't yet a "failure" a reviewer needs to
  -- see, just an internal retry the next worker tick will attempt.
  if v_next_status = 'failed' then
    select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
    v_project_id := public.audio_item_project_id(v_audio_item_id);
    v_action := case v_job_type
      when 'transcription' then 'transcript_failed'
      when 'comparison' then 'comparison_failed'
      else 'health_failed'
    end;
    insert into public.activity_events
      (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
    values (
      null, public.current_organisation_id(), v_project_id, v_audio_item_id,
      'ai_job', left(p_error, 120), v_action, jsonb_build_object('ai_job_id', p_job_id, 'error', p_error)
    );
  end if;
end;
$$;

create or replace function public.record_transcript_result(
  p_job_id uuid,
  p_language text,
  p_full_text text,
  p_processing_duration_ms int,
  p_segments jsonb -- [{ sort_order, start_ms, end_ms, text, confidence, word_timings }, ...]
)
returns uuid
language plpgsql
as $$
declare
  v_audio_version_id uuid;
  v_model_id uuid;
  v_transcript_id uuid;
  v_next_version int;
  v_transcript_version_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
begin
  select audio_version_id, ai_model_metadata_id into v_audio_version_id, v_model_id
    from public.ai_jobs where id = p_job_id;

  v_transcript_id := public.ensure_transcript(v_audio_version_id);

  select coalesce(max(version_number), 0) + 1 into v_next_version
    from public.transcript_versions where transcript_id = v_transcript_id;

  insert into public.transcript_versions
    (transcript_id, version_number, ai_job_id, ai_model_metadata_id, language, full_text, processing_duration_ms)
  values
    (v_transcript_id, v_next_version, p_job_id, v_model_id, p_language, p_full_text, p_processing_duration_ms)
  returning id into v_transcript_version_id;

  insert into public.transcript_segments (transcript_version_id, sort_order, start_ms, end_ms, text, confidence, word_timings)
  select
    v_transcript_version_id,
    (elem ->> 'sort_order')::int,
    (elem ->> 'start_ms')::int,
    (elem ->> 'end_ms')::int,
    elem ->> 'text',
    nullif(elem ->> 'confidence', '')::numeric,
    elem -> 'word_timings'
  from jsonb_array_elements(p_segments) as elem;

  update public.transcripts set current_transcript_version_id = v_transcript_version_id where id = v_transcript_id;

  update public.ai_jobs set status = 'completed', completed_at = now() where id = p_job_id;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    null, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'transcript', 'transcript completed', 'transcript_completed',
    jsonb_build_object('ai_job_id', p_job_id, 'transcript_version_id', v_transcript_version_id, 'version_number', v_next_version)
  );

  return v_transcript_version_id;
end;
$$;

create or replace function public.record_comparison_result(
  p_job_id uuid,
  p_transcript_version_id uuid,
  p_script_revision_id uuid,
  p_match_ratio numeric,
  p_findings jsonb, -- [{ sort_order, classification, script_line_sort_order, script_text, transcript_segment_id, transcript_text, start_ms, end_ms, confidence }, ...]
  p_pronunciation_findings jsonb -- [{ comparison_finding_index, transcript_segment_id, word, category, confidence, start_ms, end_ms }, ...]
)
returns uuid
language plpgsql
as $$
declare
  v_audio_version_id uuid;
  v_model_id uuid;
  v_comparison_result_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_finding_ids uuid[];
begin
  select audio_version_id, ai_model_metadata_id into v_audio_version_id, v_model_id
    from public.ai_jobs where id = p_job_id;

  insert into public.comparison_results
    (audio_version_id, transcript_version_id, script_revision_id, ai_job_id, ai_model_metadata_id, match_ratio)
  values
    (v_audio_version_id, p_transcript_version_id, p_script_revision_id, p_job_id, v_model_id, p_match_ratio)
  returning id into v_comparison_result_id;

  with inserted as (
    insert into public.comparison_findings
      (comparison_result_id, sort_order, classification, script_line_sort_order, script_text, transcript_segment_id, transcript_text, start_ms, end_ms, confidence)
    select
      v_comparison_result_id,
      (elem ->> 'sort_order')::int,
      (elem ->> 'classification')::public.diff_classification,
      nullif(elem ->> 'script_line_sort_order', '')::int,
      elem ->> 'script_text',
      nullif(elem ->> 'transcript_segment_id', '')::uuid,
      elem ->> 'transcript_text',
      nullif(elem ->> 'start_ms', '')::int,
      nullif(elem ->> 'end_ms', '')::int,
      nullif(elem ->> 'confidence', '')::numeric
    from jsonb_array_elements(p_findings) as elem
    order by (elem ->> 'sort_order')::int
    returning id, sort_order
  )
  select array_agg(id order by sort_order) into v_finding_ids from inserted;

  insert into public.pronunciation_findings
    (audio_version_id, transcript_version_id, comparison_finding_id, transcript_segment_id, ai_job_id, ai_model_metadata_id, word, category, confidence, start_ms, end_ms)
  select
    v_audio_version_id,
    p_transcript_version_id,
    case when elem ? 'comparison_finding_index' then v_finding_ids[(elem ->> 'comparison_finding_index')::int + 1] else null end,
    nullif(elem ->> 'transcript_segment_id', '')::uuid,
    p_job_id,
    v_model_id,
    elem ->> 'word',
    (elem ->> 'category')::public.pronunciation_category,
    nullif(elem ->> 'confidence', '')::numeric,
    nullif(elem ->> 'start_ms', '')::int,
    nullif(elem ->> 'end_ms', '')::int
  from jsonb_array_elements(coalesce(p_pronunciation_findings, '[]'::jsonb)) as elem;

  update public.ai_jobs set status = 'completed', completed_at = now() where id = p_job_id;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    null, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'comparison', 'comparison generated', 'comparison_generated',
    jsonb_build_object('ai_job_id', p_job_id, 'comparison_result_id', v_comparison_result_id, 'match_ratio', p_match_ratio)
  );

  return v_comparison_result_id;
end;
$$;

create or replace function public.record_health_snapshot(
  p_job_id uuid,
  p_transcript_version_id uuid,
  p_comparison_result_id uuid,
  p_overall_rating public.health_rating,
  p_category_scores jsonb -- [{ category, rating, summary }, ...]
)
returns uuid
language plpgsql
as $$
declare
  v_audio_version_id uuid;
  v_model_id uuid;
  v_snapshot_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
begin
  select audio_version_id, ai_model_metadata_id into v_audio_version_id, v_model_id
    from public.ai_jobs where id = p_job_id;

  insert into public.recording_health_snapshots
    (audio_version_id, transcript_version_id, comparison_result_id, ai_job_id, ai_model_metadata_id, overall_rating)
  values
    (v_audio_version_id, p_transcript_version_id, p_comparison_result_id, p_job_id, v_model_id, p_overall_rating)
  returning id into v_snapshot_id;

  insert into public.recording_health_category_scores (snapshot_id, category, rating, summary)
  select v_snapshot_id, (elem ->> 'category')::public.health_category, (elem ->> 'rating')::public.health_rating, elem ->> 'summary'
  from jsonb_array_elements(p_category_scores) as elem;

  update public.ai_jobs set status = 'completed', completed_at = now() where id = p_job_id;

  select audio_item_id into v_audio_item_id from public.audio_versions where id = v_audio_version_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    null, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'recording_health', 'health generated', 'health_generated',
    jsonb_build_object('ai_job_id', p_job_id, 'snapshot_id', v_snapshot_id, 'overall_rating', p_overall_rating)
  );

  return v_snapshot_id;
end;
$$;
