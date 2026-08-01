-- Release Candidate 1 — Admin area support.
--
-- Accounts are created and managed by IMA Admins only (no public sign-up,
-- no self-serve invite-by-email) — see docs/release-candidate-1.md. Users
-- are disabled, never hard-deleted, so `is_active` is the single lifecycle
-- flag the Admin area and every "who has access" listing checks.

alter table public.user_profiles add column is_active boolean not null default true;

comment on column public.user_profiles.is_active is
  'False once an IMA Admin disables the account. Never delete a user_profiles row — this flag is the whole lifecycle. The matching auth.users row is also banned (see the disableUser action) so a still-valid session cannot outlive this flag.';

create or replace function public.is_ima_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'ima_admin';
$$;

comment on function public.is_ima_admin() is
  'True only for ima_admin — the single role allowed into the Admin area.';

-- Closes a real gap: `user_profiles_update_self` (Phase 2A) lets a user
-- update every column of their own row, including role/organisation_id,
-- with no column-level restriction. Only the Admin area's service-role
-- actions may change role/organisation_id/is_active from here on.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.organisation_id is distinct from old.organisation_id
    or new.is_active is distinct from old.is_active
  then
    raise exception 'Only an IMA Admin can change role, organisation, or active status.';
  end if;

  return new;
end;
$$;

create trigger user_profiles_prevent_self_escalation
before update on public.user_profiles
for each row execute function public.prevent_self_privilege_escalation();
