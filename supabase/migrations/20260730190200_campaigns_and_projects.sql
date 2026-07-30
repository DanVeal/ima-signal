-- Phase 2A — campaigns, projects, and the project-level access helper

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation_id uuid not null references public.organisations (id),
  created_at timestamptz not null default now()
);

create index campaigns_organisation_id_idx on public.campaigns (organisation_id);

-- One row per project, of either type. A PRAMS project's `type = 'prams'`
-- row is the parent that `prams_updates` (next migration) attaches to 1:1 —
-- see that migration's comment for why the two are split.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  type public.project_type not null,
  campaign_id uuid not null references public.campaigns (id),
  name text not null,
  job_number text not null unique,
  description text not null default '',
  status public.project_status not null default 'draft_script',
  owner_user_id uuid references public.user_profiles (id),
  studio_organisation_id uuid references public.organisations (id),
  recording_deadline date,
  internal_review_deadline date,
  client_review_deadline date,
  live_date date,
  notification_email text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_campaign_id_idx on public.projects (campaign_id);
create index projects_studio_organisation_id_idx on public.projects (studio_organisation_id);
create index projects_type_idx on public.projects (type);

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Replaces the prototype's Project.jet2ReviewerUserIds string array with a
-- real many-to-many.
create table public.project_jet2_reviewers (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  primary key (project_id, user_id)
);

-- The single tenant-isolation predicate every project-scoped table's RLS
-- policy is built from: IMA and Jet2 see every project; a studio sees only
-- projects assigned to its own organisation. SECURITY DEFINER + STABLE so
-- Postgres can use it freely inside other policies without a privilege
-- escalation surprise (it only ever reads, never writes).
create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_organisation_type()
    when 'ima' then true
    when 'jet2' then true
    when 'studio' then exists (
      select 1 from public.projects pr
      where pr.id = target_project_id
        and pr.studio_organisation_id = public.current_organisation_id()
    )
    else false
  end;
$$;

comment on function public.can_access_project(uuid) is
  'Tenant-isolation predicate reused by every project-scoped table''s RLS policy.';

alter table public.campaigns enable row level security;
alter table public.projects enable row level security;
alter table public.project_jet2_reviewers enable row level security;

create policy campaigns_select_authenticated on public.campaigns
  for select
  to authenticated
  using (true);

create policy campaigns_write_ima_managers on public.campaigns
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy projects_select_accessible on public.projects
  for select
  to authenticated
  using (public.can_access_project(id));

create policy projects_insert_ima_managers on public.projects
  for insert
  to authenticated
  with check (public.is_ima_manager());

create policy projects_update_ima_managers on public.projects
  for update
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());

create policy project_jet2_reviewers_select_accessible on public.project_jet2_reviewers
  for select
  to authenticated
  using (public.can_access_project(project_id));

create policy project_jet2_reviewers_write_ima_managers on public.project_jet2_reviewers
  for all
  to authenticated
  using (public.is_ima_manager())
  with check (public.is_ima_manager());
