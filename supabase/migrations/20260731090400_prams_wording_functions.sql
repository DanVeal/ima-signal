-- Phase 2B — the three wording operations, as atomic RPC functions
--
-- All three follow the same shape: create a brand-new, immutable
-- prams_wording_groups row, then repoint the affected cells' CURRENT
-- membership to it (retiring their old membership row, never deleting it),
-- and log an activity_events row naming exactly which announcement
-- versions were affected. SECURITY INVOKER (the default) deliberately —
-- these run as the calling user, so the same RLS policies that gate direct
-- table writes (is_ima_manager()) gate these too. There is no separate
-- authorization check duplicated inside the function bodies.

create or replace function public.prams_project_id_for_row(p_row_id uuid)
returns uuid
language sql
stable
as $$
  select sec.project_id
  from public.prams_matrix_rows r
  join public.prams_sections sec on sec.id = r.section_id
  where r.id = p_row_id;
$$;

-- ── 1. Editing shared wording ────────────────────────────────────────────
create or replace function public.edit_shared_wording(
  p_wording_group_id uuid,
  p_new_text text
)
returns uuid
language plpgsql
as $$
declare
  v_row_id uuid;
  v_project_id uuid;
  v_new_group_id uuid;
  v_actor_id uuid;
  v_affected_refs jsonb;
  v_member record;
begin
  select row_id into v_row_id from public.prams_wording_groups where id = p_wording_group_id;
  if v_row_id is null then
    raise exception 'wording group % not found', p_wording_group_id;
  end if;
  v_project_id := public.prams_project_id_for_row(v_row_id);
  v_actor_id := (select id from public.user_profiles where auth_user_id = auth.uid());

  -- The exact impact set — every cell currently assigned to this group —
  -- gathered BEFORE any writes, so it reflects reality at the moment of edit.
  select jsonb_agg(jsonb_build_object(
           'reference_code', a.reference_code,
           'full_reference', a.current_title
         ))
    into v_affected_refs
    from public.prams_wording_group_members m
    join public.prams_matrix_cells c on c.id = m.matrix_cell_id
    join public.prams_announcement_versions v on v.id = c.announcement_version_id
    join public.prams_announcements a on a.id = v.announcement_id
   where m.wording_group_id = p_wording_group_id and m.is_current;

  if v_affected_refs is null or jsonb_array_length(v_affected_refs) = 0 then
    raise exception 'wording group % has no current members to edit', p_wording_group_id;
  end if;

  insert into public.prams_wording_groups (row_id, text, source, created_by_user_id)
  values (v_row_id, p_new_text, 'manual_shared_edit', v_actor_id)
  returning id into v_new_group_id;

  for v_member in
    select m.id as membership_id, m.matrix_cell_id
    from public.prams_wording_group_members m
    where m.wording_group_id = p_wording_group_id and m.is_current
  loop
    update public.prams_wording_group_members
      set is_current = false
      where id = v_member.membership_id;

    insert into public.prams_wording_group_members
      (wording_group_id, matrix_cell_id, is_current, replaces_membership_id)
    values (v_new_group_id, v_member.matrix_cell_id, true, v_member.membership_id);
  end loop;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id,
    'prams_wording_group', p_wording_group_id::text, 'wording_edited',
    jsonb_build_object(
      'previous_wording_group_id', p_wording_group_id,
      'new_wording_group_id', v_new_group_id,
      'new_text', p_new_text,
      'affected_announcements', v_affected_refs
    )
  );

  return v_new_group_id;
end;
$$;

comment on function public.edit_shared_wording(uuid, text) is
  'Creates a new wording group and repoints every cell currently sharing '
  'p_wording_group_id to it. The previous group and its membership rows are '
  'preserved untouched (is_current flips to false, nothing is deleted).';

-- ── 2. Creating a variant-specific override ──────────────────────────────
create or replace function public.create_variant_override(
  p_wording_group_id uuid,
  p_matrix_cell_id uuid,
  p_new_text text
)
returns uuid
language plpgsql
as $$
declare
  v_row_id uuid;
  v_project_id uuid;
  v_new_group_id uuid;
  v_actor_id uuid;
  v_old_membership_id uuid;
  v_reference jsonb;
begin
  select id into v_old_membership_id
    from public.prams_wording_group_members
   where wording_group_id = p_wording_group_id
     and matrix_cell_id = p_matrix_cell_id
     and is_current;

  if v_old_membership_id is null then
    raise exception 'cell % is not a current member of wording group %', p_matrix_cell_id, p_wording_group_id;
  end if;

  select row_id into v_row_id from public.prams_wording_groups where id = p_wording_group_id;
  v_project_id := public.prams_project_id_for_row(v_row_id);
  v_actor_id := (select id from public.user_profiles where auth_user_id = auth.uid());

  select jsonb_build_object('reference_code', a.reference_code, 'full_reference', a.current_title)
    into v_reference
    from public.prams_matrix_cells c
    join public.prams_announcement_versions v on v.id = c.announcement_version_id
    join public.prams_announcements a on a.id = v.announcement_id
   where c.id = p_matrix_cell_id;

  insert into public.prams_wording_groups (row_id, text, source, created_by_user_id)
  values (v_row_id, p_new_text, 'override_split', v_actor_id)
  returning id into v_new_group_id;

  -- Only the one selected cell moves — every other member of the original
  -- group is untouched, still pointing at it.
  update public.prams_wording_group_members
    set is_current = false
    where id = v_old_membership_id;

  insert into public.prams_wording_group_members
    (wording_group_id, matrix_cell_id, is_current, replaces_membership_id)
  values (v_new_group_id, p_matrix_cell_id, true, v_old_membership_id);

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id,
    'prams_wording_group', p_wording_group_id::text, 'override_created',
    jsonb_build_object(
      'original_wording_group_id', p_wording_group_id,
      'new_wording_group_id', v_new_group_id,
      'new_text', p_new_text,
      'overridden_announcement', v_reference
    )
  );

  return v_new_group_id;
end;
$$;

comment on function public.create_variant_override(uuid, uuid, text) is
  'Splits one cell out of a shared wording group into its own independent '
  'group. Every other member of the original group is left exactly as-is.';

-- ── 3. Re-merging ─────────────────────────────────────────────────────────
create or replace function public.remerge_wording_cells(
  p_matrix_cell_ids uuid[],
  p_text text
)
returns uuid
language plpgsql
as $$
declare
  v_row_id uuid;
  v_other_row_id uuid;
  v_project_id uuid;
  v_new_group_id uuid;
  v_actor_id uuid;
  v_cell_id uuid;
  v_old_membership_id uuid;
  v_affected_refs jsonb;
begin
  if array_length(p_matrix_cell_ids, 1) is null or array_length(p_matrix_cell_ids, 1) < 2 then
    raise exception 'remerge requires at least two cells, got %', coalesce(array_length(p_matrix_cell_ids, 1), 0);
  end if;

  select row_id into v_row_id from public.prams_matrix_cells where id = p_matrix_cell_ids[1];
  if v_row_id is null then
    raise exception 'cell % not found', p_matrix_cell_ids[1];
  end if;

  -- All cells being re-merged must belong to the same matrix row — a
  -- re-merge is a within-row structural change, never cross-row.
  for v_cell_id in select unnest(p_matrix_cell_ids[2:])
  loop
    select row_id into v_other_row_id from public.prams_matrix_cells where id = v_cell_id;
    if v_other_row_id is distinct from v_row_id then
      raise exception 'cell % belongs to a different row than the rest of the re-merge set', v_cell_id;
    end if;
  end loop;

  v_project_id := public.prams_project_id_for_row(v_row_id);
  v_actor_id := (select id from public.user_profiles where auth_user_id = auth.uid());

  select jsonb_agg(jsonb_build_object('reference_code', a.reference_code, 'full_reference', a.current_title))
    into v_affected_refs
    from public.prams_matrix_cells c
    join public.prams_announcement_versions v on v.id = c.announcement_version_id
    join public.prams_announcements a on a.id = v.announcement_id
   where c.id = any (p_matrix_cell_ids);

  insert into public.prams_wording_groups (row_id, text, source, created_by_user_id)
  values (v_row_id, p_text, 'remerge', v_actor_id)
  returning id into v_new_group_id;

  foreach v_cell_id in array p_matrix_cell_ids
  loop
    select id into v_old_membership_id
      from public.prams_wording_group_members
     where matrix_cell_id = v_cell_id and is_current;

    if v_old_membership_id is not null then
      update public.prams_wording_group_members set is_current = false where id = v_old_membership_id;
    end if;

    insert into public.prams_wording_group_members
      (wording_group_id, matrix_cell_id, is_current, replaces_membership_id)
    values (v_new_group_id, v_cell_id, true, v_old_membership_id);
  end loop;

  insert into public.activity_events
    (actor_user_id, organisation_id, project_id, entity_type, entity_label, action, metadata)
  values (
    v_actor_id, public.current_organisation_id(), v_project_id,
    'prams_wording_group', v_new_group_id::text, 'remerged',
    jsonb_build_object(
      'new_wording_group_id', v_new_group_id,
      'text', p_text,
      'merged_announcements', v_affected_refs
    )
  );

  return v_new_group_id;
end;
$$;

comment on function public.remerge_wording_cells(uuid[], text) is
  'Explicit re-merge: the caller names the exact cells and the agreed text. '
  'Never triggered by matching text automatically. Old membership rows are '
  'retired, never deleted — full override/re-merge lineage stays queryable '
  'via replaces_membership_id.';

grant execute on function public.edit_shared_wording(uuid, text) to authenticated;
grant execute on function public.create_variant_override(uuid, uuid, text) to authenticated;
grant execute on function public.remerge_wording_cells(uuid[], text) to authenticated;
