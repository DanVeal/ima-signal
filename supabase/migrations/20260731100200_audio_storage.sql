-- Phase 2C.1 — Supabase Storage: one private bucket for recordings, with
-- storage.objects RLS mirroring the audio_items/audio_versions gating
-- exactly, so the same three claims hold at the byte level, not just the
-- metadata level: IMA/studio can upload to their own projects, everyone who
-- can access a project can read (play back) its recordings, no public
-- files, no cross-project access.
--
-- Object path convention (enforced by policy, not just convention):
--   {project_id}/{audio_item_id}/{random-uuid}-{sanitised-original-filename}
-- storage.foldername(name) returns every path segment except the final
-- filename, so (storage.foldername(name))[1] is always the project_id.

insert into storage.buckets (id, name, public, file_size_limit)
values ('audio-recordings', 'audio-recordings', false, 209715200) -- 200MiB
on conflict (id) do nothing;

-- Upload: only an IMA manager, or a studio uploading to its own project's
-- path — same predicate as audio_items/audio_versions' insert policies.
create policy audio_recordings_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio-recordings'
    and public.can_upload_audio_for_project(((storage.foldername(name))[1])::uuid)
  );

-- Playback: anyone who can access the project — this is what makes a Jet2
-- reviewer's access "playback only": they satisfy this SELECT policy but
-- never the INSERT one above.
create policy audio_recordings_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audio-recordings'
    and public.can_access_project(((storage.foldername(name))[1])::uuid)
  );

-- Deliberately no UPDATE or DELETE policy on this bucket at all — an
-- uploaded object is as immutable as its audio_versions row. Replacing a
-- recording writes a new object at a new path; nothing already in storage
-- is ever touched again.
