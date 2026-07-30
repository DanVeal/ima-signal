# Phase 2A — Schema Reference

The tables, enums, and functions created by `supabase/migrations/`. This is the backend
foundation only — see `docs/phase-2a-limitations.md` for what's deliberately not here yet
(scripts, audio, the PRAMS matrix, comments, approvals, ...).

## Architecture decision: the global PRAMS registry

Per the approved Phase 2 plan revision, a PRAMS announcement reference (e.g. `081A.J2`) has
one persistent identity that survives across updates (July 2026, October 2026, ...).
Concretely, that identity is split into two tables:

- **`prams_announcements`** — the global registry. One row per `reference_code`, forever.
  `current_title`/`current_tags` are editable metadata: changing them never changes
  identity. There is no `project_id` here — this table is not scoped to any one update.
- **`prams_announcement_versions`** — the per-update membership record. One row per
  `(announcement_id, project_id)` pair: this is what "each PRAMS update creates a
  version-specific announcement record beneath that master identity" means concretely. It
  carries everything that's specific to how this announcement behaves in *this* update:
  which section it's in, its title as imported into this update (`title_at_import`, which
  can differ from the registry's current title without changing identity), its column
  position, and whether it's still `active` in this update or has been `removed` (never
  deleted — see below).

If a workbook re-import (Phase 2B) sees a reference code that no longer matches an existing
announcement, that is **not** assumed to be a rename — it's flagged for manual confirmation
rather than auto-linked. That confirmation flow doesn't exist yet (no workbook import
exists yet), but the two-table split is what makes it possible without data loss later.

## Enums

| Enum | Values |
|---|---|
| `organisation_type` | `ima`, `jet2`, `studio` |
| `user_role` | `ima_admin`, `ima_producer`, `ima_reviewer`, `jet2_reviewer`, `jet2_view_only`, `studio_admin`, `studio_contributor` |
| `project_type` | `standard_radio`, `prams` |
| `project_status` | `draft_script`, `ready_to_record`, `studio_recording`, `ready_for_ima_review`, `ima_changes_requested`, `ready_for_jet2_review`, `jet2_changes_requested`, `approved`, `delivered` (mirrors `src/types/domain.ts`'s `ProjectStatus` exactly) |
| `prams_update_status` | `draft`, `active`, `archived` |
| `prams_announcement_version_status` | `active`, `removed` |

## Tables

**`organisations`** — `id`, `type`, `name`. IMA, Jet2, and one or more studios.

**`user_profiles`** — `id`, `auth_user_id` (unique FK → `auth.users`), `full_name`, `email`
(unique), `avatar_initials`, `organisation_id` (FK), `role`. The row every RLS policy in
this schema keys off — never `auth.users` directly.

**`campaigns`** — `id`, `name`, `organisation_id` (FK).

**`projects`** — `id`, `type`, `campaign_id` (FK), `name`, `job_number` (unique), `status`,
`owner_user_id`, `studio_organisation_id` (FK — the tenant-isolation boundary for studio
roles), four deadline dates, `notification_email`, `deleted_at` (soft delete). One row per
project of either type. A `prams`-typed row is the parent a `prams_updates` row attaches to.

**`project_jet2_reviewers`** — `(project_id, user_id)` join table, replacing the
prototype's `jet2ReviewerUserIds` string array with a real many-to-many.

**`prams_updates`** — `id`, `project_id` (FK, unique — 1:1 with a `prams`-typed project),
`update_label` (e.g. "July 2026 Update"), `workbook_source_label`, `status`,
`effective_from`, `superseded_by_update_id` (self-FK, for a future update lineage). Split
out from `projects` so the generic project table stays clean; a trigger
(`check_project_is_prams`) enforces that its `project_id` always points at a `prams`-typed
project.

**`prams_announcements`** — the global registry (§ above): `id`, `reference_code`
(unique), `current_title`, `current_tags` (jsonb), `notes`.

**`prams_sections`** — `id`, `project_id` (FK — scoped to one update, **not** global —
"Boarding" in two different updates is two different rows, linked only by matching `slug`),
`slug`, `name`, `sort_order`, `available` (false = not yet transcribed from the source
workbook — the honesty rule from the frontend, carried into the schema), `source_sheet_name`.

**`prams_announcement_versions`** — the per-update membership record (§ above): `id`,
`announcement_id` (FK), `project_id` (FK), `section_id` (FK, nullable), `title_at_import`,
`tags`, `column_order`, `status`. Unique on `(project_id, announcement_id)`.

**`activity_events`** — `id`, `actor_user_id`, `organisation_id`, `project_id` (FK),
`entity_type`, `entity_label`, `action`, `metadata` (jsonb). Append-only — see
`docs/phase-2a-rls.md` for how that's enforced. Two triggers demonstrate the pattern this
early: `projects_log_created` (fires on every project insert) and
`prams_announcement_versions_log_removed` (fires when a version's status flips to
`removed`). A general-purpose "log every structural change" system (for the future
workbook-import diff) is Phase 2B.

## Helper functions

All `SECURITY DEFINER` + `STABLE`, used throughout the RLS policies (see
`docs/phase-2a-rls.md`):

- `current_profile()`, `current_organisation_type()`, `current_organisation_id()`,
  `current_role()` — resolve `auth.uid()` to the calling user's `user_profiles` row.
- `is_ima_manager()` — true for `ima_admin`/`ima_producer`, the two roles allowed to write
  projects and the PRAMS registry.
- `can_access_project(project_id)` — the single tenant-isolation predicate every
  project-scoped table's policy is built from: true for `ima`/`jet2` always, true for
  `studio` only when the project's `studio_organisation_id` matches the caller's own.
- `set_updated_at()` — generic trigger, keeps `updated_at` current on UPDATE.
- `check_project_is_prams()` — trigger, refuses to attach a `prams_updates`/`prams_sections`/
  `prams_announcement_versions` row to a `standard_radio` project.

## Migration files

```
20260730190000_extensions_and_enums.sql
20260730190100_organisations_and_users.sql
20260730190200_campaigns_and_projects.sql
20260730190300_prams_registry.sql
20260730190400_activity_events.sql
20260730190500_grants.sql
```

`20260730190500_grants.sql` exists because newer Supabase projects do not auto-expose new
tables to the Data API roles by default (see the comment in `supabase/config.toml`) — RLS
only restricts *rows*; the underlying `GRANT` must separately permit the operation. `anon`
gets nothing anywhere in this schema — every table requires a signed-in user.
