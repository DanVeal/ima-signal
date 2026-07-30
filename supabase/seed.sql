-- Phase 2A seed data — mirrors the current frontend mock data
-- (src/lib/mock/data.ts, src/lib/mock/prams-library.ts) so the same three
-- Standard Radio projects and the same PRAMS July 2026 update exist in the
-- real database. Local development only — the password below is
-- intentionally simple and must never be used outside a local stack.

-- ── Organisations ────────────────────────────────────────────────────────
insert into public.organisations (id, type, name) values
  ('00000000-0000-0000-0000-000000000101', 'ima',    'IMA'),
  ('00000000-0000-0000-0000-000000000102', 'jet2',   'Jet2'),
  ('00000000-0000-0000-0000-000000000103', 'studio', 'Coastal Sound Studios');

-- ── Auth users + profiles ────────────────────────────────────────────────
-- One real Supabase Auth user per mock person, all sharing one local-dev
-- password so the RLS test suite (supabase/tests) can sign in as each role.
do $$
declare
  dev_password text := 'devpassword123';
  users jsonb := '[
    {"auth_id":"00000000-0000-0000-0000-000000000201","profile_id":"00000000-0000-0000-0000-000000000301","email":"priya.anand@ima.global","full_name":"Priya Anand","initials":"PA","org":"00000000-0000-0000-0000-000000000101","role":"ima_admin"},
    {"auth_id":"00000000-0000-0000-0000-000000000202","profile_id":"00000000-0000-0000-0000-000000000302","email":"tom.radcliffe@ima.global","full_name":"Tom Radcliffe","initials":"TR","org":"00000000-0000-0000-0000-000000000101","role":"ima_producer"},
    {"auth_id":"00000000-0000-0000-0000-000000000203","profile_id":"00000000-0000-0000-0000-000000000303","email":"sasha.lindqvist@ima.global","full_name":"Sasha Lindqvist","initials":"SL","org":"00000000-0000-0000-0000-000000000101","role":"ima_reviewer"},
    {"auth_id":"00000000-0000-0000-0000-000000000204","profile_id":"00000000-0000-0000-0000-000000000304","email":"helen.marsh@jet2.com","full_name":"Helen Marsh","initials":"HM","org":"00000000-0000-0000-0000-000000000102","role":"jet2_reviewer"},
    {"auth_id":"00000000-0000-0000-0000-000000000205","profile_id":"00000000-0000-0000-0000-000000000305","email":"craig.osei@jet2.com","full_name":"Craig Osei","initials":"CO","org":"00000000-0000-0000-0000-000000000102","role":"jet2_reviewer"},
    {"auth_id":"00000000-0000-0000-0000-000000000206","profile_id":"00000000-0000-0000-0000-000000000306","email":"fatima.iqbal@jet2.com","full_name":"Fatima Iqbal","initials":"FI","org":"00000000-0000-0000-0000-000000000102","role":"jet2_view_only"},
    {"auth_id":"00000000-0000-0000-0000-000000000207","profile_id":"00000000-0000-0000-0000-000000000307","email":"ben.foster@coastalsound.studio","full_name":"Ben Foster","initials":"BF","org":"00000000-0000-0000-0000-000000000103","role":"studio_admin"},
    {"auth_id":"00000000-0000-0000-0000-000000000208","profile_id":"00000000-0000-0000-0000-000000000308","email":"ellie.nakamura@coastalsound.studio","full_name":"Ellie Nakamura","initials":"EN","org":"00000000-0000-0000-0000-000000000103","role":"studio_contributor"}
  ]'::jsonb;
  u jsonb;
begin
  for u in select * from jsonb_array_elements(users)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (u->>'auth_id')::uuid,
      'authenticated',
      'authenticated',
      u->>'email',
      crypt(dev_password, gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      (u->>'auth_id')::uuid,
      u->>'auth_id',
      jsonb_build_object('sub', u->>'auth_id', 'email', u->>'email'),
      'email',
      now(), now(), now()
    );

    insert into public.user_profiles (id, auth_user_id, full_name, email, avatar_initials, organisation_id, role)
    values (
      (u->>'profile_id')::uuid,
      (u->>'auth_id')::uuid,
      u->>'full_name',
      u->>'email',
      u->>'initials',
      (u->>'org')::uuid,
      (u->>'role')::public.user_role
    );
  end loop;
end $$;

-- ── Campaigns ─────────────────────────────────────────────────────────────
insert into public.campaigns (id, name, organisation_id) values
  ('00000000-0000-0000-0000-000000000401', 'Jet2 Winter Sun 2026', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000402', 'Jet2 Summer Sale 2026', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000403', 'Jet2 Onboard Announcements (PRAMS)', '00000000-0000-0000-0000-000000000102');

-- ── Projects (3 Standard Radio + 1 PRAMS, matching data.ts / prams-library.ts) ──
insert into public.projects (
  id, type, campaign_id, name, job_number, description, status, owner_user_id,
  studio_organisation_id, recording_deadline, internal_review_deadline,
  client_review_deadline, live_date, notification_email
) values
  (
    '00000000-0000-0000-0000-000000000501', 'standard_radio', '00000000-0000-0000-0000-000000000401',
    'Winter Sun Dynamic Radio — Wave 1', 'JET-2026-0142',
    'Dynamic 30" radio spots for five departure routes, promoting Winter Sun package deals with a shared VO structure and route-specific inserts.',
    'ready_for_jet2_review', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000103',
    '2026-07-25', '2026-07-30', '2026-08-05', '2026-08-11', 'productions@ima.global'
  ),
  (
    '00000000-0000-0000-0000-000000000502', 'standard_radio', '00000000-0000-0000-0000-000000000401',
    'Winter Sun Dynamic Radio — Wave 2', 'JET-2026-0143',
    'Second wave of Winter Sun routes, recorded to the same brief as Wave 1.',
    'studio_recording', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000103',
    '2026-08-08', '2026-08-12', '2026-08-18', '2026-08-25', null
  ),
  (
    '00000000-0000-0000-0000-000000000503', 'standard_radio', '00000000-0000-0000-0000-000000000402',
    'Summer Sale — Late Escapes', 'JET-2026-0098',
    'Tactical late-availability spots for the tail end of the summer sale.',
    'delivered', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000103',
    '2026-06-20', '2026-06-24', '2026-06-27', '2026-07-01', null
  ),
  (
    '00000000-0000-0000-0000-000000000504', 'prams', '00000000-0000-0000-0000-000000000403',
    'PRAMS — July 2026 Update', 'JET-PRAMS-2026-07',
    'The full July 2026 onboard-announcement release: every PRAMS section, announcement variant and audio recording for this update cycle.',
    'ready_for_jet2_review', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000103',
    '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', null
  );

insert into public.project_jet2_reviewers (project_id, user_id) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000304'),
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000305'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000304'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000305'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000306'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000304'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000305');

-- ── PRAMS update record ───────────────────────────────────────────────────
insert into public.prams_updates (id, project_id, update_label, workbook_source_label, status, effective_from)
values (
  '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000504',
  'July 2026 Update', 'Onboard PRAMS Grid — July 26 Changes.xlsx', 'active', '2026-07-06'
);

-- ── PRAMS sections (all 9, matching prams-library.ts PRAMS_SECTIONS) ─────
insert into public.prams_sections (id, project_id, slug, name, sort_order, available, source_sheet_name) values
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000504', 'boarding', 'Boarding', 1, true, 'Boarding Charters'),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000504', 'safety-demonstration', 'Safety Demonstration', 2, false, null),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000504', 'after-take-off', 'After Take-off', 3, false, null),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000504', 'in-flight', 'In-flight', 4, false, null),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000504', 'descent', 'Descent', 5, false, null),
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-000000000504', 'arrival', 'Arrival', 6, false, null),
  ('00000000-0000-0000-0000-000000000707', '00000000-0000-0000-0000-000000000504', 'delays', 'Delays', 7, false, null),
  ('00000000-0000-0000-0000-000000000708', '00000000-0000-0000-0000-000000000504', 'diversions', 'Diversions', 8, false, null),
  ('00000000-0000-0000-0000-000000000709', '00000000-0000-0000-0000-000000000504', 'special-announcements', 'Special Announcements', 9, false, null);

-- ── PRAMS announcements: global registry + this update's membership rows ──

-- Boarding: the 4 real references transcribed from the supplied workbook.
-- Hand-authored, not generated, because this is real data, not scale filler.
with boarding(reference_code, title, tags, column_order) as (
  values
    ('080.J2',  'BOARDING',                     '[]'::jsonb,               1),
    ('080A.J2', 'BOARDING – VIP',                '["VIP"]'::jsonb,          2),
    ('081A.J2', 'BOARDING & FUEL – VIP',         '["VIP", "Fuel"]'::jsonb,  3),
    ('081.J2',  'BOARDING & FUEL',               '["Fuel"]'::jsonb,         4)
),
inserted_announcements as (
  insert into public.prams_announcements (reference_code, current_title, current_tags)
  select reference_code, title, tags from boarding
  returning id, reference_code
)
insert into public.prams_announcement_versions (announcement_id, project_id, section_id, title_at_import, tags, column_order, status)
select
  a.id,
  '00000000-0000-0000-0000-000000000504',
  '00000000-0000-0000-0000-000000000701',
  b.title,
  b.tags,
  b.column_order,
  'active'
from inserted_announcements a
join boarding b on b.reference_code = a.reference_code;

-- Every other section: represented structurally to demonstrate scale
-- (100+ announcement variants across the update), never with invented
-- wording — Phase 2A has no wording/matrix tables at all yet. Reference
-- codes and titles here are administrative identifiers, not spoken script
-- content.
do $$
declare
  sections jsonb := '[
    {"section_id":"00000000-0000-0000-0000-000000000702","name":"SAFETY DEMONSTRATION","code_base":100,"count":15},
    {"section_id":"00000000-0000-0000-0000-000000000703","name":"AFTER TAKE-OFF","code_base":150,"count":11},
    {"section_id":"00000000-0000-0000-0000-000000000704","name":"IN-FLIGHT","code_base":190,"count":24},
    {"section_id":"00000000-0000-0000-0000-000000000705","name":"DESCENT","code_base":230,"count":10},
    {"section_id":"00000000-0000-0000-0000-000000000706","name":"ARRIVAL","code_base":260,"count":17},
    {"section_id":"00000000-0000-0000-0000-000000000707","name":"DELAYS","code_base":290,"count":13},
    {"section_id":"00000000-0000-0000-0000-000000000708","name":"DIVERSIONS","code_base":320,"count":9},
    {"section_id":"00000000-0000-0000-0000-000000000709","name":"SPECIAL ANNOUNCEMENTS","code_base":350,"count":13}
  ]'::jsonb;
  sec jsonb;
  i int;
  code text;
  tag_group text[];
  title_suffix text;
  ann_id uuid;
begin
  for sec in select * from jsonb_array_elements(sections)
  loop
    for i in 0 .. (sec->>'count')::int - 1
    loop
      code := ((sec->>'code_base')::int + i)::text || '.J2';

      -- Mirrors the frontend's TAG_CYCLE (12-length, mostly untagged with
      -- occasional VIP/Fuel) so the seeded registry has the same texture.
      case i % 12
        when 1 then tag_group := array['VIP'];
        when 4 then tag_group := array['Fuel'];
        when 7 then tag_group := array['VIP', 'Fuel'];
        else tag_group := array[]::text[];
      end case;

      title_suffix := case
        when tag_group = array['VIP', 'Fuel'] then ' – VIP / FUEL STOP'
        when tag_group = array['VIP'] then ' – VIP'
        when tag_group = array['Fuel'] then ' – FUEL STOP'
        else ''
      end;

      insert into public.prams_announcements (reference_code, current_title, current_tags)
      values (code, (sec->>'name') || title_suffix, to_jsonb(tag_group))
      returning id into ann_id;

      insert into public.prams_announcement_versions
        (announcement_id, project_id, section_id, title_at_import, tags, column_order, status)
      values (
        ann_id,
        '00000000-0000-0000-0000-000000000504',
        (sec->>'section_id')::uuid,
        (sec->>'name') || title_suffix,
        to_jsonb(tag_group),
        i + 1,
        'active'
      );
    end loop;
  end loop;
end $$;

-- ── Standard Radio: scripts → variants → revisions → ordered lines ───────
-- One base script ("Winter Sun Dynamic Radio") with five destination/
-- airport variants, matching the real approved bodies from
-- src/lib/mock/data.ts (script-mnc-tfs etc, version 2 / the approved one).
-- Lines are that same real approved text, split on sentence boundaries —
-- nothing invented, just decomposed into the ordered-lines shape Phase 2B
-- introduces for Standard Radio.
do $$
declare
  script_id uuid := '00000000-0000-0000-0000-000000000801';
  variants jsonb := '[
    {"id":"00000000-0000-0000-0000-000000000811","revision_id":"00000000-0000-0000-0000-000000000821","code":"MAN-TFS","destination":"Tenerife","airport":"Manchester","order":1,
     "body":"Escape to Tenerife this winter with Jet2holidays, flying direct from Manchester. From £399pp, based on two adults sharing, with selected dates in November and December. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com."},
    {"id":"00000000-0000-0000-0000-000000000812","revision_id":"00000000-0000-0000-0000-000000000822","code":"BHX-FAO","destination":"Faro","airport":"Birmingham","order":2,
     "body":"The Algarve is closer than you think. Jet2holidays flies direct from Birmingham to Faro this winter, from £429pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com."},
    {"id":"00000000-0000-0000-0000-000000000813","revision_id":"00000000-0000-0000-0000-000000000823","code":"LBA-ALC","destination":"Alicante","airport":"Leeds Bradford","order":3,
     "body":"Costa Blanca sunshine, direct from Leeds Bradford. Jet2holidays to Alicante from £389pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com."},
    {"id":"00000000-0000-0000-0000-000000000814","revision_id":"00000000-0000-0000-0000-000000000824","code":"GLA-ACE","destination":"Lanzarote","airport":"Glasgow","order":4,
     "body":"Year-round sunshine is waiting in Lanzarote, direct from Glasgow with Jet2holidays. From £419pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com."},
    {"id":"00000000-0000-0000-0000-000000000815","revision_id":"00000000-0000-0000-0000-000000000825","code":"LPL-FUE","destination":"Fuerteventura","airport":"Liverpool","order":5,
     "body":"Golden beaches, direct from Liverpool. Jet2holidays to Fuerteventura from £409pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com."}
  ]'::jsonb;
  v jsonb;
  lines text[];
  i int;
begin
  insert into public.scripts (id, project_id, title)
  values (script_id, '00000000-0000-0000-0000-000000000501', 'Winter Sun Dynamic Radio');

  for v in select * from jsonb_array_elements(variants)
  loop
    insert into public.script_variants (id, script_id, variant_code, destination, departure_airport, column_order)
    values (
      (v->>'id')::uuid, script_id, v->>'code', v->>'destination', v->>'airport', (v->>'order')::int
    );

    insert into public.script_revisions
      (id, variant_id, revision_number, is_approved_for_recording, approved_by_user_id, approved_at, created_by_user_id)
    values (
      (v->>'revision_id')::uuid, (v->>'id')::uuid, 1, true,
      '00000000-0000-0000-0000-000000000301', '2026-07-11T14:40:00Z', '00000000-0000-0000-0000-000000000302'
    );

    lines := regexp_split_to_array(v->>'body', '(?<=\.)\s+');
    for i in 1 .. array_length(lines, 1)
    loop
      insert into public.script_lines (revision_id, sort_order, text)
      values ((v->>'revision_id')::uuid, i, lines[i]);
    end loop;
  end loop;
end $$;

-- ── PRAMS Boarding matrix: rows, wording groups, cells, membership ────────
-- The exact structure produced by parsing the real supplied workbook
-- ("Boarding Charters" sheet) — see src/lib/prams-import/parser.ts and its
-- test fixture. Hand-encoded here (rather than run through the importer at
-- seed time) so `supabase db reset` stays the one command that fully
-- reconstructs the database; docs/phase-2b-import.md shows the same
-- structure produced by running the real importer against the fixture.
do $$
declare
  boarding_rows jsonb := '[
    {"row_key":"row-5","sort_order":1,"groups":[
      {"refs":["080.J2"],"text":"Hello and welcome onboard this Jet2.com flight."},
      {"refs":["080A.J2","081A.J2"],"text":"Hello and welcome onboard."},
      {"refs":["081.J2"],"text":"Hello and welcome onboard this Jet2.com flight."}
    ]},
    {"row_key":"row-6","sort_order":2,"groups":[
      {"refs":["080.J2"],"text":"It''s nearly time for take-off, so please find your seat as quickly as you can and get comfy."},
      {"refs":["080A.J2","081A.J2"],"text":"It''s nearly time for take-off, so please find your seat and get comfortable."},
      {"refs":["081.J2"],"text":"It''s nearly time for take-off, so please find your seat as quickly as you can and get comfy."}
    ]},
    {"row_key":"row-7","sort_order":3,"groups":[
      {"refs":["080.J2","080A.J2","081A.J2","081.J2"],"text":"Small bags and anything containing powerbanks or glass bottles must be put underneath the seat in front of you. And make sure the aisle and exit areas are nice and clear."}
    ]},
    {"row_key":"row-8","sort_order":4,"groups":[
      {"refs":["080.J2","080A.J2"],"text":null},
      {"refs":["081A.J2","081.J2"],"text":"Just so you know, the aircraft is being refuelled. For your safety while we do this, please switch off all phones, tablets and other devices. Please stay seated with your seat belt unfastened. And remember, smoking and vaping are not allowed."}
    ]},
    {"row_key":"row-9","sort_order":5,"groups":[
      {"refs":["080.J2"],"text":"If you need a hand, we''ll be happy to help. Have a lovely flight!"},
      {"refs":["080A.J2","081A.J2"],"text":"If there is anything we can help you with, please let a member of the cabin crew know."},
      {"refs":["081.J2"],"text":"If you need a hand, we''ll be happy to help. Have a lovely flight!"}
    ]}
  ]'::jsonb;
  v_section_id uuid := '00000000-0000-0000-0000-000000000701';
  v_project_id uuid := '00000000-0000-0000-0000-000000000504';
  v_row_def jsonb;
  v_group_def jsonb;
  v_row_id uuid;
  v_group_id uuid;
  v_ref text;
  v_version_id uuid;
  v_cell_id uuid;
begin
  for v_row_def in select * from jsonb_array_elements(boarding_rows)
  loop
    insert into public.prams_matrix_rows (section_id, row_key, sort_order)
    values (v_section_id, v_row_def->>'row_key', (v_row_def->>'sort_order')::int)
    returning id into v_row_id;

    for v_group_def in select * from jsonb_array_elements(v_row_def->'groups')
    loop
      insert into public.prams_wording_groups (row_id, text, source)
      values (
        v_row_id,
        case when v_group_def->>'text' = 'null' then null else v_group_def->>'text' end,
        'workbook_import'
      )
      returning id into v_group_id;

      for v_ref in select jsonb_array_elements_text(v_group_def->'refs')
      loop
        select v.id into v_version_id
        from public.prams_announcement_versions v
        join public.prams_announcements a on a.id = v.announcement_id
        where v.project_id = v_project_id and a.reference_code = v_ref;

        insert into public.prams_matrix_cells (row_id, announcement_version_id)
        values (v_row_id, v_version_id)
        returning id into v_cell_id;

        insert into public.prams_wording_group_members (wording_group_id, matrix_cell_id, is_current)
        values (v_group_id, v_cell_id, true);
      end loop;
    end loop;
  end loop;
end $$;

-- ── A second PRAMS update, for structural comparison testing ─────────────
-- Deliberately reuses the SAME global announcement identities (Boarding is
-- identical — proves "unchanged" detection) while the synthetic Safety
-- Demonstration section has a handful of intentional differences: one
-- reference dropped, one added, one retitled. All Safety Demonstration
-- content here was already structural placeholder data (never real
-- transcribed wording), so varying it for this purpose doesn't touch
-- anything the real workbook produced.
do $$
declare
  october_project_id uuid := '00000000-0000-0000-0000-000000000505';
  october_boarding_section uuid := '00000000-0000-0000-0000-000000000710';
  october_safety_section uuid := '00000000-0000-0000-0000-000000000711';
  ann record;
  new_ann_id uuid;
begin
  insert into public.projects (id, type, campaign_id, name, job_number, description, status, owner_user_id, studio_organisation_id, recording_deadline, internal_review_deadline, client_review_deadline, live_date)
  values (
    october_project_id, 'prams', '00000000-0000-0000-0000-000000000403',
    'PRAMS — October 2026 Update', 'JET-PRAMS-2026-10',
    'The October 2026 onboard-announcement release, for structural comparison against the July update.',
    'draft_script', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000103',
    '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'
  );

  insert into public.prams_updates (project_id, update_label, status, effective_from)
  values (october_project_id, 'October 2026 Update', 'draft', '2026-10-01');

  insert into public.prams_sections (id, project_id, slug, name, sort_order, available)
  values
    (october_boarding_section, october_project_id, 'boarding', 'Boarding', 1, true),
    (october_safety_section, october_project_id, 'safety-demonstration', 'Safety Demonstration', 2, false);

  -- Boarding: identical membership to July, same 4 global announcements.
  for ann in
    select a.id as announcement_id, v.title_at_import, v.tags, v.column_order
    from public.prams_announcement_versions v
    join public.prams_announcements a on a.id = v.announcement_id
    where v.project_id = '00000000-0000-0000-0000-000000000504' and v.section_id = '00000000-0000-0000-0000-000000000701'
  loop
    insert into public.prams_announcement_versions (announcement_id, project_id, section_id, title_at_import, tags, column_order, status)
    values (ann.announcement_id, october_project_id, october_boarding_section, ann.title_at_import, ann.tags, ann.column_order, 'active');
  end loop;

  -- Safety Demonstration: same as July except one dropped, one retitled, one new.
  for ann in
    select a.id as announcement_id, a.reference_code, v.title_at_import, v.tags, v.column_order
    from public.prams_announcement_versions v
    join public.prams_announcements a on a.id = v.announcement_id
    where v.project_id = '00000000-0000-0000-0000-000000000504' and v.section_id = '00000000-0000-0000-0000-000000000702'
      and a.reference_code <> '114.J2' -- dropped in October
  loop
    insert into public.prams_announcement_versions (announcement_id, project_id, section_id, title_at_import, tags, column_order, status)
    values (
      ann.announcement_id, october_project_id, october_safety_section,
      case when ann.reference_code = '101.J2' then ann.title_at_import || ' (REVISED WORDING)' else ann.title_at_import end,
      ann.tags, ann.column_order, 'active'
    );
  end loop;

  insert into public.prams_announcements (reference_code, current_title, current_tags)
  values ('115.J2', 'SAFETY DEMONSTRATION', '[]'::jsonb)
  returning id into new_ann_id;

  insert into public.prams_announcement_versions (announcement_id, project_id, section_id, title_at_import, tags, column_order, status)
  values (new_ann_id, october_project_id, october_safety_section, 'SAFETY DEMONSTRATION', '[]'::jsonb, 16, 'active');
end $$;
