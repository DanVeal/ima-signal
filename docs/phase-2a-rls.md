# Phase 2A — Row-Level Security

Every table created in Phase 2A has RLS **enabled**, with policies backed by two helper
functions (`can_access_project`, `is_ima_manager` — see `docs/phase-2a-schema.md`) so the
access rule is defined once and reused, not copy-pasted per table. Authorization is enforced
at the database, not the frontend — the role-preview switcher in the UI has no bearing on
what a real signed-in session can actually read or write.

## Roles

| Role | Reads | Writes |
|---|---|---|
| `ima_admin`, `ima_producer` | Everything (all projects, both types, the full registry) | Projects, PRAMS updates/sections/registry, campaigns |
| `ima_reviewer` | Everything | Nothing in Phase 2A (no comments/approvals exist yet to review) |
| `jet2_reviewer`, `jet2_view_only` | Everything | Nothing in Phase 2A |
| `studio_admin`, `studio_contributor` | Only projects where `studio_organisation_id` matches their own organisation, plus the (non-project-scoped) global PRAMS registry | Nothing in Phase 2A — Phase 2B adds studio audio-upload write access |

Every role can read `organisations` and `user_profiles` in full (an internal-tool people
directory, not sensitive data) and can update only their own `user_profiles` row.

## Policy shape, by table

- **`organisations`, `user_profiles`, `campaigns`, `prams_announcements`** — not
  project-scoped, so `can_access_project` doesn't apply. Readable by any authenticated user;
  writes gated to `is_ima_manager()` (except `user_profiles`, gated to
  `auth_user_id = auth.uid()` — self only).
- **`projects`, `project_jet2_reviewers`, `prams_updates`, `prams_sections`,
  `prams_announcement_versions`, `activity_events`** — every policy's `USING`/`WITH CHECK`
  is `can_access_project(project_id)` (or `can_access_project(id)` for `projects` itself).
  Writes on all but `activity_events` are additionally gated to `is_ima_manager()`.
- **`activity_events`** — insert allowed to anyone who can access the project (so the app
  can log activity as the acting user); **no UPDATE or DELETE policy exists at all**, which
  under RLS means those operations are denied outright, not just filtered. That's what makes
  it a real append-only audit log rather than a convention someone could bypass with a
  direct API call.

## Automated proof: `pnpm run test:rls`

`supabase/tests/rls.test.mjs` signs in as six of the seeded users via the **real** Supabase
Auth API (not a stub) and issues **real** requests through PostgREST, asserting on the
actual rows/errors returned — this is testing the deployed policies, not a unit test of
the SQL in isolation. 20 assertions, six groups:

1. **Baseline visibility** — `ima_admin`, `jet2_reviewer`, `jet2_view_only`, and
   `studio_contributor` all see the four seeded projects (all currently assigned to one
   studio).
2. **Cross-studio isolation** — the suite creates a second, temporary studio organisation
   and a project assigned to it (via the service-role client, bypassing RLS to set up the
   fixture), then proves `ima_admin`/`jet2_reviewer` **can** see it while
   `studio_contributor`/`studio_admin` **cannot** — the one assertion that actually exercises
   the studio branch of `can_access_project`, since the seed data alone doesn't have two
   studios to distinguish.
3. **Write gating** — `ima_admin`/`ima_producer` can create a project;
   `jet2_reviewer`/`studio_contributor` cannot (RLS raises an error, not a silent no-op).
4. **Global registry** — `studio_contributor` can read all 116 seeded announcements but
   cannot write one; `ima_admin` can.
5. **Self-update only** — `studio_contributor` can update their own `full_name`, cannot
   update someone else's (0 rows affected, not an error — `UPDATE` under RLS silently
   matches zero rows rather than raising, so the test checks the affected-row count *and*
   independently confirms via the service-role client that the target row is unchanged).
6. **Append-only audit log** — `ima_admin` can insert an `activity_events` row; the same
   user cannot update it afterwards (0 rows affected — no UPDATE policy exists for anyone).

All fixtures the suite creates (the temporary organisation/project, test projects, a test
registry entry, a test activity event) are cleaned up via the service-role client at the end
of the run, so it's safe to run repeatedly against the same local stack.

## What Phase 2A's RLS deliberately does not yet cover

There is no `scripts`/`audio_items`/`audio_versions`/`review_comments`/`change_requests`/
`approvals` policy yet, because those tables don't exist yet (Phase 2B). The workflow rule
that only a Jet2 reviewer may decide while a version is `ready_for_jet2_review` (IMA review
vs. Jet2 review, §7 of the Phase 2 plan) also isn't encoded anywhere yet — RLS alone is a
poor fit for that kind of multi-condition state-machine rule, and the plan's intent is to
enforce it in an application/edge-function layer with RLS as tenant-isolation backstop, not
the primary mechanism. That layer doesn't exist yet either.
