-- Phase 2A — organisations and user profiles

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  type public.organisation_type not null,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.organisations is
  'IMA, Jet2, and one or more recording studios. A tenant boundary for RLS.';

-- One row per real person, linked 1:1 to a Supabase Auth user. This is the
-- row RLS policies key off (organisation + role), not auth.users directly.
create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  avatar_initials text not null,
  organisation_id uuid not null references public.organisations (id),
  role public.user_role not null,
  created_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'A person. organisation_id + role drive every RLS policy in this schema.';

create index user_profiles_organisation_id_idx on public.user_profiles (organisation_id);

-- Helper functions RLS policies are built on. SECURITY DEFINER so they can
-- read user_profiles regardless of the calling role's own row-level access,
-- without duplicating "who is this and what org are they in" in every policy.
create or replace function public.current_profile()
returns public.user_profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.user_profiles where auth_user_id = auth.uid();
$$;

create or replace function public.current_organisation_type()
returns public.organisation_type
language sql
stable
security definer
set search_path = public
as $$
  select o.type
  from public.user_profiles p
  join public.organisations o on o.id = p.organisation_id
  where p.auth_user_id = auth.uid();
$$;

create or replace function public.current_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organisation_id from public.user_profiles p where p.auth_user_id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.user_profiles p where p.auth_user_id = auth.uid();
$$;

create or replace function public.is_ima_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('ima_admin', 'ima_producer');
$$;

comment on function public.is_ima_manager() is
  'True for the two IMA roles allowed to create/edit projects and the PRAMS registry.';

alter table public.organisations enable row level security;
alter table public.user_profiles enable row level security;

-- Organisations and the user directory are non-sensitive reference data in
-- this internal tool (names only) — every authenticated user can read both,
-- matching the existing "People" page's behaviour. Writes are service-role
-- only for now (no self-serve org/user management UI in Phase 2A).
create policy organisations_select_authenticated on public.organisations
  for select
  to authenticated
  using (true);

create policy user_profiles_select_authenticated on public.user_profiles
  for select
  to authenticated
  using (true);

create policy user_profiles_update_self on public.user_profiles
  for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
