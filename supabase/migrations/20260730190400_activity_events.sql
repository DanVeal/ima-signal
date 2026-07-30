-- Phase 2A — activity history
--
-- Append-only audit trail. No UPDATE/DELETE policy is ever defined for this
-- table — once RLS is enabled, the absence of a policy for an operation
-- denies it outright, which is exactly the property an audit log needs.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profiles (id),
  organisation_id uuid references public.organisations (id),
  project_id uuid not null references public.projects (id) on delete cascade,
  entity_type text not null,
  entity_label text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_project_id_created_at_idx
  on public.activity_events (project_id, created_at desc);

alter table public.activity_events enable row level security;

create policy activity_events_select_accessible on public.activity_events
  for select
  to authenticated
  using (public.can_access_project(project_id));

-- Insert-only for anyone who can already see the project — lets the app
-- layer log activity as the acting user, while UPDATE/DELETE stay
-- unreachable via the API (no such policy exists).
create policy activity_events_insert_accessible on public.activity_events
  for insert
  to authenticated
  with check (public.can_access_project(project_id));

-- Demonstrates the auditability pattern this early, on the tables that
-- exist today. A general-purpose "log every structural change" trigger
-- system (e.g. for the future workbook-import diff) is Phase 2B — see
-- known limitations in the Phase 2A docs.
create or replace function public.log_project_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (actor_user_id, organisation_id, project_id, entity_type, entity_label, action)
  values (
    (select id from public.user_profiles where auth_user_id = auth.uid()),
    public.current_organisation_id(),
    new.id,
    'project',
    new.name,
    'project_created'
  );
  return new;
end;
$$;

create trigger projects_log_created
  after insert on public.projects
  for each row execute function public.log_project_created();

create or replace function public.log_announcement_version_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    insert into public.activity_events (actor_user_id, organisation_id, project_id, entity_type, entity_label, action)
    values (
      (select id from public.user_profiles where auth_user_id = auth.uid()),
      public.current_organisation_id(),
      new.project_id,
      'prams_announcement_version',
      (select reference_code from public.prams_announcements where id = new.announcement_id),
      'status_changed'
    );
  end if;
  return new;
end;
$$;

create trigger prams_announcement_versions_log_removed
  after update on public.prams_announcement_versions
  for each row execute function public.log_announcement_version_removed();
