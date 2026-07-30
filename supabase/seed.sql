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
