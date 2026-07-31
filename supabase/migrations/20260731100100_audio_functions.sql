-- Phase 2C.1 — the two audio-version write operations, as atomic RPC
-- functions, mirroring Phase 2B's wording-operations pattern: one Postgres
-- function call is genuinely atomic (unlike the multi-statement import
-- commit), and SECURITY INVOKER means the same RLS that gates a direct
-- table write gates these too — no authorization check duplicated here.

-- ── 1. create_audio_version: a fresh upload, or a replacement ────────────
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

  select coalesce(a.reference_code, sv.variant_code, p_original_filename)
    into v_entity_label
    from public.audio_items ai
    left join public.script_variants sv on sv.id = ai.script_variant_id
    left join public.prams_announcement_versions av on av.id = ai.announcement_version_id
    left join public.prams_announcements a on a.id = av.announcement_id
   where ai.id = p_audio_item_id;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id,
    'audio_version', coalesce(v_entity_label, p_original_filename),
    case when v_next_version = 1 then 'audio_uploaded' else 'audio_version_created' end,
    jsonb_build_object(
      'audio_item_id', p_audio_item_id,
      'audio_version_id', v_new_version_id,
      'version_number', v_next_version,
      'original_filename', p_original_filename,
      'duration_seconds', p_duration_seconds
    )
  );

  return v_new_version_id;
end;
$$;

comment on function public.create_audio_version(uuid, text, text, bigint, text, numeric, text, int, int, int, text, jsonb) is
  'Inserts a brand-new immutable audio_versions row and repoints '
  'audio_items.current_version_id to it. Never touches an existing '
  'version row. The caller (a route handler that already downloaded, '
  'probed, and hashed the file) must supply real extracted metadata, not '
  'placeholders.';

grant execute on function public.create_audio_version(uuid, text, text, bigint, text, numeric, text, int, int, int, text, jsonb) to authenticated;

-- ── 2. restore_audio_version: make an older version current again ───────
-- Never re-fetches or re-uploads bytes — the old version's storage object
-- still exists (nothing is ever deleted from storage either), so this
-- copies its metadata into a brand-new version row and repoints current,
-- exactly like Phase 2B's re-merge: a new record, full lineage preserved,
-- nothing overwritten.
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

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id,
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

comment on function public.restore_audio_version(uuid) is
  'Makes an older version current again WITHOUT deleting or mutating any '
  'existing row — creates one new audio_versions row (same storage_path/'
  'metadata as the target, restored_from_version_id set) and repoints '
  'audio_items.current_version_id. Every prior version, including the one '
  'that was current before this call, stays exactly as it was.';

grant execute on function public.restore_audio_version(uuid) to authenticated;
