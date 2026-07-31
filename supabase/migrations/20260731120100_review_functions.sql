-- Phase 2C.2 — Review Engine: RPC functions
--
-- Same shape as every atomic operation since Phase 2B: one Postgres
-- function per action, SECURITY INVOKER (the RLS policies from the
-- previous migration are the real gate — no authorization check is
-- duplicated here except where a transition needs to be MORE specific
-- than the table-level policy allows, e.g. archiving being IMA-manager-
-- only when the UPDATE policy on `reviews` is deliberately broader).

create or replace function public.ensure_review_participant(p_review_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
begin
  insert into public.review_participants (review_id, user_id, role_at_time)
  values (p_review_id, p_user_id, (select role from public.user_profiles where id = p_user_id))
  on conflict (review_id, user_id) do nothing;
end;
$$;

create or replace function public.current_user_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.user_profiles where auth_user_id = auth.uid();
$$;

-- ── Comments ──────────────────────────────────────────────────────────────

-- One call for both "start a new thread" (p_thread_id null) and "reply to
-- an existing one" (p_thread_id set) — the natural single entry point a
-- comment composer calls either way.
create or replace function public.post_comment(
  p_thread_id uuid,
  p_audio_item_id uuid,
  p_audio_version_id uuid,
  p_is_timecoded boolean,
  p_start_ms int,
  p_end_ms int,
  p_body text,
  p_mentioned_user_ids uuid[]
)
returns uuid
language plpgsql
as $$
declare
  v_thread_id uuid;
  v_comment_id uuid;
  v_actor_id uuid;
  v_project_id uuid;
  v_review_id uuid;
begin
  v_actor_id := public.current_user_profile_id();

  if p_thread_id is not null then
    v_thread_id := p_thread_id;
    select audio_item_id into p_audio_item_id from public.comment_threads where id = v_thread_id;
  else
    insert into public.comment_threads
      (audio_item_id, audio_version_id, is_timecoded, start_ms, end_ms, created_by_user_id)
    values
      (p_audio_item_id, p_audio_version_id, p_is_timecoded, p_start_ms, p_end_ms, v_actor_id)
    returning id into v_thread_id;
  end if;

  insert into public.comments (thread_id, author_user_id, body, mentioned_user_ids)
  values (v_thread_id, v_actor_id, p_body, coalesce(p_mentioned_user_ids, '{}'))
  returning id into v_comment_id;

  v_project_id := public.audio_item_project_id(p_audio_item_id);
  select id into v_review_id from public.reviews where audio_item_id = p_audio_item_id;
  perform public.ensure_review_participant(v_review_id, v_actor_id);

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, p_audio_item_id,
    'comment', left(p_body, 80), 'comment_added',
    jsonb_build_object('thread_id', v_thread_id, 'comment_id', v_comment_id, 'is_new_thread', p_thread_id is null)
  );

  return v_comment_id;
end;
$$;

grant execute on function public.post_comment(uuid, uuid, uuid, boolean, int, int, text, uuid[]) to authenticated;

create or replace function public.edit_comment(p_comment_id uuid, p_new_body text)
returns void
language plpgsql
as $$
declare
  v_old_body text;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_row_count int;
begin
  v_actor_id := public.current_user_profile_id();

  select c.body, t.audio_item_id into v_old_body, v_audio_item_id
  from public.comments c
  join public.comment_threads t on t.id = c.thread_id
  where c.id = p_comment_id;

  if v_old_body is null then
    raise exception 'comment % not found', p_comment_id;
  end if;

  insert into public.comment_edits (comment_id, previous_body) values (p_comment_id, v_old_body);

  update public.comments set body = p_new_body, edited_at = now() where id = p_comment_id;
  get diagnostics v_row_count = row_count;
  -- The SELECT above is readable by anyone with project access
  -- (comments_select_accessible), but this UPDATE is RLS-gated to the
  -- comment's own author (comments_update_own) — a non-author's call
  -- would otherwise silently affect 0 rows and report success.
  if v_row_count = 0 then
    raise exception 'not permitted to edit this comment';
  end if;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'comment', left(p_new_body, 80), 'comment_edited', jsonb_build_object('comment_id', p_comment_id)
  );
end;
$$;

grant execute on function public.edit_comment(uuid, text) to authenticated;

create or replace function public.soft_delete_comment(p_comment_id uuid)
returns void
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_row_count int;
begin
  v_actor_id := public.current_user_profile_id();

  select t.audio_item_id into v_audio_item_id
  from public.comments c
  join public.comment_threads t on t.id = c.thread_id
  where c.id = p_comment_id;

  if v_audio_item_id is null then
    raise exception 'comment % not found', p_comment_id;
  end if;

  update public.comments set deleted_at = now() where id = p_comment_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'not permitted to delete this comment';
  end if;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'comment', 'comment removed', 'comment_deleted', jsonb_build_object('comment_id', p_comment_id)
  );
end;
$$;

grant execute on function public.soft_delete_comment(uuid) to authenticated;

create or replace function public.resolve_thread(p_thread_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_resolution_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_review_id uuid;
begin
  v_actor_id := public.current_user_profile_id();
  select audio_item_id into v_audio_item_id from public.comment_threads where id = p_thread_id;
  if v_audio_item_id is null then
    raise exception 'thread % not found', p_thread_id;
  end if;

  insert into public.comment_thread_resolutions (thread_id, action, actor_user_id)
  values (p_thread_id, 'resolved', v_actor_id)
  returning id into v_resolution_id;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  select id into v_review_id from public.reviews where audio_item_id = v_audio_item_id;
  perform public.ensure_review_participant(v_review_id, v_actor_id);

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'comment_thread', 'thread resolved', 'comment_resolved', jsonb_build_object('thread_id', p_thread_id)
  );

  return v_resolution_id;
end;
$$;

grant execute on function public.resolve_thread(uuid) to authenticated;

create or replace function public.reopen_thread(p_thread_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_resolution_id uuid;
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
begin
  v_actor_id := public.current_user_profile_id();
  select audio_item_id into v_audio_item_id from public.comment_threads where id = p_thread_id;
  if v_audio_item_id is null then
    raise exception 'thread % not found', p_thread_id;
  end if;

  insert into public.comment_thread_resolutions (thread_id, action, actor_user_id)
  values (p_thread_id, 'reopened', v_actor_id)
  returning id into v_resolution_id;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'comment_thread', 'thread reopened', 'comment_reopened', jsonb_build_object('thread_id', p_thread_id)
  );

  return v_resolution_id;
end;
$$;

grant execute on function public.reopen_thread(uuid) to authenticated;

-- ── Approvals ─────────────────────────────────────────────────────────────

create or replace function public.create_approval(
  p_audio_item_id uuid,
  p_audio_version_id uuid,
  p_decision text,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  v_approval_id uuid;
  v_current_version_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_review_id uuid;
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'invalid decision %, expected approved or changes_requested', p_decision;
  end if;

  select current_version_id into v_current_version_id from public.audio_items where id = p_audio_item_id;
  if v_current_version_id is distinct from p_audio_version_id then
    raise exception 'can only decide on the CURRENT version (%), not %', v_current_version_id, p_audio_version_id;
  end if;

  v_actor_id := public.current_user_profile_id();

  insert into public.approvals (audio_item_id, audio_version_id, decision, decided_by_user_id, note)
  values (p_audio_item_id, p_audio_version_id, p_decision, v_actor_id, p_note)
  returning id into v_approval_id;

  select id into v_review_id from public.reviews where audio_item_id = p_audio_item_id;
  update public.reviews
     set status = case p_decision when 'approved' then 'approved'::public.review_status else 'changes_requested'::public.review_status end
   where id = v_review_id;
  perform public.ensure_review_participant(v_review_id, v_actor_id);

  v_project_id := public.audio_item_project_id(p_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, p_audio_item_id,
    'approval', p_decision, case p_decision when 'approved' then 'approval_granted' else 'approval_changes_requested' end,
    jsonb_build_object('approval_id', v_approval_id, 'audio_version_id', p_audio_version_id, 'note', p_note)
  );

  return v_approval_id;
end;
$$;

grant execute on function public.create_approval(uuid, uuid, text, text) to authenticated;

create or replace function public.withdraw_approval(
  p_audio_item_id uuid,
  p_audio_version_id uuid,
  p_note text
)
returns uuid
language plpgsql
as $$
declare
  v_approval_id uuid;
  v_current_version_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_review_id uuid;
  v_latest_decision text;
begin
  select decision into v_latest_decision
    from public.approvals
   where audio_item_id = p_audio_item_id and audio_version_id = p_audio_version_id
   order by created_at desc
   limit 1;

  if v_latest_decision is null or v_latest_decision = 'withdrawn' then
    raise exception 'no active approval decision to withdraw for this version';
  end if;

  v_actor_id := public.current_user_profile_id();

  insert into public.approvals (audio_item_id, audio_version_id, decision, decided_by_user_id, note)
  values (p_audio_item_id, p_audio_version_id, 'withdrawn', v_actor_id, p_note)
  returning id into v_approval_id;

  select r.id, ai.current_version_id into v_review_id, v_current_version_id
  from public.reviews r join public.audio_items ai on ai.id = r.audio_item_id
  where r.audio_item_id = p_audio_item_id;

  if v_current_version_id = p_audio_version_id then
    update public.reviews set status = 'ready_for_review' where id = v_review_id;
  end if;
  perform public.ensure_review_participant(v_review_id, v_actor_id);

  v_project_id := public.audio_item_project_id(p_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, p_audio_item_id,
    'approval', 'approval withdrawn', 'approval_withdrawn',
    jsonb_build_object('approval_id', v_approval_id, 'audio_version_id', p_audio_version_id, 'note', p_note)
  );

  return v_approval_id;
end;
$$;

grant execute on function public.withdraw_approval(uuid, uuid, text) to authenticated;

-- ── Change requests ───────────────────────────────────────────────────────

create or replace function public.create_change_request(
  p_audio_item_id uuid,
  p_audio_version_id uuid,
  p_category text,
  p_message text,
  p_timecode_ms int,
  p_priority text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_current_version_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_review_id uuid;
begin
  select current_version_id into v_current_version_id from public.audio_items where id = p_audio_item_id;
  if v_current_version_id is distinct from p_audio_version_id then
    raise exception 'can only request changes on the CURRENT version (%), not %', v_current_version_id, p_audio_version_id;
  end if;

  v_actor_id := public.current_user_profile_id();

  insert into public.change_requests
    (audio_item_id, audio_version_id, category, message, timecode_ms, priority, created_by_user_id)
  values
    (p_audio_item_id, p_audio_version_id, p_category, p_message, p_timecode_ms, p_priority, v_actor_id)
  returning id into v_id;

  select id into v_review_id from public.reviews where audio_item_id = p_audio_item_id;
  update public.reviews set status = 'changes_requested' where id = v_review_id;
  perform public.ensure_review_participant(v_review_id, v_actor_id);

  v_project_id := public.audio_item_project_id(p_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, p_audio_item_id,
    'change_request', left(p_message, 80), 'change_request_created',
    jsonb_build_object('change_request_id', v_id, 'category', p_category, 'priority', p_priority, 'timecode_ms', p_timecode_ms)
  );

  return v_id;
end;
$$;

grant execute on function public.create_change_request(uuid, uuid, text, text, int, text) to authenticated;

create or replace function public.resolve_change_request(p_change_request_id uuid, p_note text)
returns void
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_status text;
  v_row_count int;
begin
  select audio_item_id, status into v_audio_item_id, v_status
  from public.change_requests where id = p_change_request_id;
  if v_audio_item_id is null then
    raise exception 'change request % not found', p_change_request_id;
  end if;
  if v_status is distinct from 'open' then
    raise exception 'change request % is not open (status: %)', p_change_request_id, v_status;
  end if;

  v_actor_id := public.current_user_profile_id();

  update public.change_requests
     set status = 'resolved', resolved_at = now(), resolved_by_user_id = v_actor_id
   where id = p_change_request_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'not permitted to resolve this change request';
  end if;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'change_request', 'change request resolved', 'change_request_resolved',
    jsonb_build_object('change_request_id', p_change_request_id, 'note', p_note)
  );
end;
$$;

grant execute on function public.resolve_change_request(uuid, text) to authenticated;

create or replace function public.cancel_change_request(p_change_request_id uuid)
returns void
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_status text;
  v_row_count int;
begin
  select audio_item_id, status into v_audio_item_id, v_status
  from public.change_requests where id = p_change_request_id;
  if v_audio_item_id is null then
    raise exception 'change request % not found', p_change_request_id;
  end if;
  if v_status is distinct from 'open' then
    raise exception 'change request % is not open (status: %)', p_change_request_id, v_status;
  end if;

  v_actor_id := public.current_user_profile_id();

  update public.change_requests set status = 'cancelled' where id = p_change_request_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'not permitted to cancel this change request';
  end if;

  v_project_id := public.audio_item_project_id(v_audio_item_id);
  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'change_request', 'change request cancelled', 'change_request_cancelled',
    jsonb_build_object('change_request_id', p_change_request_id)
  );
end;
$$;

grant execute on function public.cancel_change_request(uuid) to authenticated;

-- ── Review status: manual transitions ───────────────────────────────────

create or replace function public.start_review(p_review_id uuid)
returns void
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_status public.review_status;
begin
  select audio_item_id, status into v_audio_item_id, v_status from public.reviews where id = p_review_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);

  if not public.can_decide_review(v_project_id) then
    raise exception 'not permitted to start this review';
  end if;
  if v_status not in ('draft', 'ready_for_review', 'superseded') then
    raise exception 'cannot start a review that is already %', v_status;
  end if;

  v_actor_id := public.current_user_profile_id();
  update public.reviews set status = 'in_review' where id = p_review_id;
  perform public.ensure_review_participant(p_review_id, v_actor_id);

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'review', 'review started', 'review_status_changed',
    jsonb_build_object('from_status', v_status, 'to_status', 'in_review')
  );
end;
$$;

grant execute on function public.start_review(uuid) to authenticated;

create or replace function public.archive_review(p_review_id uuid)
returns void
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_status public.review_status;
begin
  if not public.is_ima_manager() then
    raise exception 'only an IMA admin/producer can archive a review';
  end if;

  select audio_item_id, status into v_audio_item_id, v_status from public.reviews where id = p_review_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  v_actor_id := public.current_user_profile_id();

  update public.reviews set status = 'archived' where id = p_review_id;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'review', 'review archived', 'review_status_changed',
    jsonb_build_object('from_status', v_status, 'to_status', 'archived')
  );
end;
$$;

grant execute on function public.archive_review(uuid) to authenticated;

-- ── Extend the Phase 2C.1 audio-version functions ──────────────────────
--
-- CREATE OR REPLACE, not a new function — same signatures as
-- 20260731100100_audio_functions.sql. Adds: audio_item_id on the
-- activity_events row (so the recording page's unified timeline includes
-- upload events without a jsonb-parsing join), and the review-status
-- transition described in docs/review-engine.md's Versioning section: a
-- replacement or restore that supersedes an APPROVED version marks the
-- review 'superseded' (an approval never silently carries over to new
-- content); any other status moves to 'ready_for_review', since a fresh
-- take genuinely is ready for a fresh look.

create or replace function public.create_audio_version(
  p_audio_item_id uuid,
  p_original_filename text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_file_checksum text,
  p_duration_seconds numeric,
  p_codec text,
  p_sample_rate_hz int,
  p_channels int,
  p_bit_rate_bps int,
  p_container_format text,
  p_waveform_peaks jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_project_id uuid;
  v_actor_id uuid;
  v_next_version int;
  v_new_version_id uuid;
  v_entity_label text;
  v_review_id uuid;
  v_review_status public.review_status;
begin
  v_project_id := public.audio_item_project_id(p_audio_item_id);
  if v_project_id is null then
    raise exception 'audio item % not found', p_audio_item_id;
  end if;
  v_actor_id := (select id from public.user_profiles where auth_user_id = auth.uid());

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.audio_versions
   where audio_item_id = p_audio_item_id;

  insert into public.audio_versions (
    audio_item_id, version_number, uploaded_by_user_id, original_filename,
    storage_path, file_size_bytes, file_checksum, duration_seconds, codec,
    sample_rate_hz, channels, bit_rate_bps, container_format, waveform_peaks
  ) values (
    p_audio_item_id, v_next_version, v_actor_id, p_original_filename,
    p_storage_path, p_file_size_bytes, p_file_checksum, p_duration_seconds, p_codec,
    p_sample_rate_hz, p_channels, p_bit_rate_bps, p_container_format, p_waveform_peaks
  )
  returning id into v_new_version_id;

  update public.audio_items
     set current_version_id = v_new_version_id
   where id = p_audio_item_id;

  select id, status into v_review_id, v_review_status from public.reviews where audio_item_id = p_audio_item_id;
  if v_review_id is not null then
    update public.reviews
       set status = case when v_review_status = 'approved' then 'superseded'::public.review_status
                          else 'ready_for_review'::public.review_status end
     where id = v_review_id;
  end if;

  select coalesce(a.reference_code, sv.variant_code, p_original_filename)
    into v_entity_label
    from public.audio_items ai
    left join public.script_variants sv on sv.id = ai.script_variant_id
    left join public.prams_announcement_versions av on av.id = ai.announcement_version_id
    left join public.prams_announcements a on a.id = av.announcement_id
   where ai.id = p_audio_item_id;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, p_audio_item_id,
    'audio_version', coalesce(v_entity_label, p_original_filename),
    case when v_next_version = 1 then 'audio_uploaded' else 'audio_version_created' end,
    jsonb_build_object(
      'audio_item_id', p_audio_item_id,
      'audio_version_id', v_new_version_id,
      'version_number', v_next_version,
      'original_filename', p_original_filename,
      'duration_seconds', p_duration_seconds,
      'review_status_after', case when v_review_status = 'approved' then 'superseded' else 'ready_for_review' end
    )
  );

  return v_new_version_id;
end;
$$;

create or replace function public.restore_audio_version(p_audio_version_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_audio_item_id uuid;
  v_project_id uuid;
  v_actor_id uuid;
  v_next_version int;
  v_new_version_id uuid;
  v_old record;
  v_review_id uuid;
  v_review_status public.review_status;
begin
  select * into v_old from public.audio_versions where id = p_audio_version_id;
  if not found then
    raise exception 'audio version % not found', p_audio_version_id;
  end if;
  v_audio_item_id := v_old.audio_item_id;
  v_project_id := public.audio_item_project_id(v_audio_item_id);
  v_actor_id := (select id from public.user_profiles where auth_user_id = auth.uid());

  select coalesce(max(version_number), 0) + 1
    into v_next_version
    from public.audio_versions
   where audio_item_id = v_audio_item_id;

  insert into public.audio_versions (
    audio_item_id, version_number, uploaded_by_user_id, original_filename,
    storage_path, file_size_bytes, file_checksum, duration_seconds, codec,
    sample_rate_hz, channels, bit_rate_bps, container_format, waveform_peaks,
    restored_from_version_id
  ) values (
    v_audio_item_id, v_next_version, v_actor_id, v_old.original_filename,
    v_old.storage_path, v_old.file_size_bytes, v_old.file_checksum, v_old.duration_seconds, v_old.codec,
    v_old.sample_rate_hz, v_old.channels, v_old.bit_rate_bps, v_old.container_format, v_old.waveform_peaks,
    p_audio_version_id
  )
  returning id into v_new_version_id;

  update public.audio_items
     set current_version_id = v_new_version_id
   where id = v_audio_item_id;

  select id, status into v_review_id, v_review_status from public.reviews where audio_item_id = v_audio_item_id;
  if v_review_id is not null then
    update public.reviews
       set status = case when v_review_status = 'approved' then 'superseded'::public.review_status
                          else 'ready_for_review'::public.review_status end
     where id = v_review_id;
  end if;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, audio_item_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id, v_audio_item_id,
    'audio_version', v_old.original_filename, 'audio_version_restored',
    jsonb_build_object(
      'audio_item_id', v_audio_item_id,
      'restored_from_version_id', p_audio_version_id,
      'restored_from_version_number', v_old.version_number,
      'new_version_id', v_new_version_id,
      'new_version_number', v_next_version
    )
  );

  return v_new_version_id;
end;
$$;
