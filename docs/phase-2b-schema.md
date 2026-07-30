# Phase 2B — Schema Reference

The persistent script and PRAMS structure behind the approved frontend: Standard Radio's
`Script → Script variant → Script revision → Ordered line` chain, and PRAMS's matrix model
(sections, rows, cells, explicit wording groups, and workbook import/re-import). Builds on
`docs/phase-2a-schema.md` — nothing there changed; everything here is additive. Excludes audio
upload/storage, transcription, comments, approvals, notifications, and background jobs, per
this round's explicit scope cut (see `docs/phase-2b-limitations.md`).

## Pre-checks, hardened before any new table was written

Three things the plan required verifying (and, where needed, strengthening) before Phase 2B
implementation began:

1. **`activity_events` is append-only at the database level, not just via missing RLS
   policies.** `20260731090000_phase2b_prechecks.sql` adds
   `reject_activity_events_mutation()`, a trigger function that unconditionally raises on any
   UPDATE or DELETE, wired via `activity_events_reject_update`/`activity_events_reject_delete`
   triggers. Crucially, triggers fire for **every** role, including `service_role` — Phase
   2A's protection (no UPDATE/DELETE policy) only stopped `authenticated`, since
   `service_role` has `rolbypassrls = true` and bypasses RLS entirely. `supabase/tests/rls.test.mjs`
   §10 proves this directly: it attempts UPDATE and DELETE via the service-role client and
   asserts the database itself rejects both.
2. **PRAMS reference codes are normalised before uniqueness checks.** The same migration adds
   `normalize_reference_code(text)` (`upper(trim(regexp_replace(input, '\s+', ' ', 'g')))`) and
   a `normalize_prams_announcement_reference_code()` `BEFORE INSERT OR UPDATE` trigger on
   `prams_announcements`, so `'  081a.j2-test  '` and `'081A.J2-TEST'` collide at the unique
   constraint regardless of casing or whitespace.
3. **The original imported value is still retained when it differs from the canonical
   one.** `prams_announcements.original_reference_code` captures whatever was inserted, once,
   never overwritten; per-update, `prams_announcement_versions.reference_code_raw` captures
   the as-imported value for that update when it differs from the canonical code (`null`
   otherwise, so the common case doesn't carry redundant data).

## Standard Radio: a deliberately simpler model

```
projects (type='standard_radio')
  └─ scripts            (one base creative concept, e.g. "Winter Sun Dynamic Radio")
      └─ script_variants     (one destination/airport/offer/region variant)
          └─ script_revisions    (one authored draft of that variant's wording)
              └─ script_lines        (ordered spoken lines within one revision)
```

No wording groups, no membership, no shared-cell concept — a Standard Radio variant's wording
belongs to exactly one revision, full stop. This is intentional: the plan explicitly says not
to force Standard Radio into the PRAMS matrix shape, even though the two share the
"revision creates new history, never overwrites" rule underneath.

- **`scripts`** — `id`, `project_id` (FK; `check_project_is_standard_radio()` trigger refuses
  attachment to a `prams` project), `title`.
- **`script_variants`** — `id`, `script_id` (FK), `variant_code`, `destination`,
  `departure_airport`, `offer_label`, `region_label`, `column_order`. Unique on
  `(script_id, variant_code)`.
- **`script_revisions`** — `id`, `variant_id` (FK), `revision_number`,
  `is_approved_for_recording`, `approved_by_user_id`, `approved_at`, `notes`,
  `created_by_user_id`. Unique on `(variant_id, revision_number)`. **Immutable once
  written**: `authenticated` is granted `select, insert` only — no `update` grant at all, and
  no UPDATE RLS policy either. A wording change always means inserting a new revision row,
  never touching an old one.
- **`script_lines`** — `id`, `revision_id` (FK), `sort_order`, `text`. Unique on
  `(revision_id, sort_order)`. Same immutability treatment as `script_revisions` (insert-only
  grant, no UPDATE policy).

## PRAMS matrix: sharing is a relationship, never an inference

The core rule, unconditionally: **two cells are never treated as sharing wording because their
text happens to match.** Sharing exists only if a `prams_wording_group_members` row says so.
This is enforced structurally by splitting "the grid coordinate," "the authored text," and
"which coordinate currently uses which text" into three separate tables — no operation
anywhere in the system compares `text` values to decide grouping.

```
prams_sections (per-update, scoped to one PRAMS project; "Boarding" in July and "Boarding"
                in October are two different rows, linked only by matching slug)
  └─ prams_matrix_rows        (one spoken-line position; row_key is the stable cross-update
                                and cross-re-import matching key, e.g. "row-5")
      └─ prams_matrix_cells       (the stable grid coordinate: (row, announcement_version).
                                    Never deleted, even once blanked or removed.)
          └─ prams_wording_group_members  (which wording group this cell currently/previously
                                            pointed at — THIS is where sharing lives)
                  ↕
              prams_wording_groups    (one immutable authored text unit per row; text=null
                                        is an intentional blank, taken straight from the
                                        source workbook)
```

- **`prams_matrix_rows`** — `id`, `section_id` (FK), `row_key`, `sort_order`, `status`
  (`active`/`removed` — a row check-constraint), `source_import_id`. Unique on
  `(section_id, row_key)`. `sort_order` can legitimately change on re-import; `row_key`
  should not — that's what makes cross-update and cross-re-import matching possible without
  assuming row counts stay identical.
- **`prams_matrix_cells`** — `id`, `row_id` (FK), `announcement_version_id` (FK),
  `source_import_id`. Unique on `(row_id, announcement_version_id)`. Created once per
  intersection that exists in the workbook; never deleted.
- **`prams_wording_groups`** — `id`, `row_id` (FK), `text` (nullable = intentional blank),
  `source` (check-constrained to `workbook_import` / `manual_shared_edit` / `override_split`
  / `remerge` — the four operations that can create one), `created_by_user_id`,
  `source_import_id`. **Immutable once written**: insert-only grant and policy, exactly like
  `script_revisions`. A row can accumulate many of these over time; which one currently
  applies lives entirely in membership.
- **`prams_wording_group_members`** — `id`, `wording_group_id` (FK), `matrix_cell_id` (FK),
  `is_current`, `replaces_membership_id` (self-FK — the full lineage chain for one cell across
  edits/overrides/re-merges). Unique on `(wording_group_id, matrix_cell_id)`. A **partial
  unique index**, `prams_wording_group_members_one_current_per_cell` on
  `(matrix_cell_id) where is_current`, enforces "at most one current membership per cell" at
  the database level — not an application-layer convention. `supabase/tests/constraints.test.mjs`
  proves both the ordinary unique constraint and the partial index directly.

### The three wording operations, as atomic RPC functions

`edit_shared_wording`, `create_variant_override`, and `remerge_wording_cells`
(`20260731090400_prams_wording_functions.sql`) all follow the same shape — create a brand-new
immutable `prams_wording_groups` row, repoint the affected cells' current membership to it
(retiring, never deleting, the old membership rows), and log an `activity_events` row naming
exactly which announcement versions were affected — but differ in *which* cells move:

| Operation | Which cells move | Result |
|---|---|---|
| `edit_shared_wording(group_id, new_text)` | Every cell currently in the group | All members get the revision |
| `create_variant_override(group_id, cell_id, new_text)` | Only the one named cell | Splits it into its own independent group; every other member is untouched |
| `remerge_wording_cells(cell_ids[], text)` | Every named cell (≥2, same row) | Explicit re-merge — never triggered automatically by matching text |

All three are `SECURITY INVOKER` (the default) — they run as the calling user, so the same
`is_ima_manager()`-gated RLS policies that apply to direct table writes apply here too; there
is no separate authorization check duplicated in the function bodies. `supabase/tests/wording-operations.test.mjs`
exercises all three plus the resulting membership lineage end-to-end.

## Workbook import and the audit trail

- **`prams_workbook_imports`** — `id`, `project_id` (FK), `file_name`, `file_hash`,
  `imported_by_user_id`, `status` (`pending_review` / `confirmed` / `discarded`), `summary`
  (jsonb), `started_at`, `completed_at`.
- **`prams_workbook_import_diffs`** — `id`, `import_id` (FK), `diff_type` (check-constrained
  to the 11 categories: `section_added`, `section_changed`, `announcement_added`,
  `announcement_removed`, `announcement_renamed`, `row_added`, `row_removed`,
  `row_reordered`, `wording_changed`, `sharing_changed`, `blank_changed`), `section_slug`,
  `row_key`, `reference_code`, `payload` (jsonb before/after detail). Insert-only, same
  immutability treatment as the other audit-trail tables — the diff record for a discarded
  import is kept, not deleted.
- Every structural table that can be touched by an import (`prams_sections`,
  `prams_announcement_versions`, `prams_matrix_rows`, `prams_matrix_cells`,
  `prams_wording_groups`) carries a `source_import_id` FK, for full import-source-and-timestamp
  traceability.

See `docs/phase-2b-import.md` for the parser, preview/diff, and commit behaviour in detail,
and `docs/phase-2b-limitations.md` for the import commit's atomicity caveat.

## RLS

Every new table has RLS enabled from creation. The pattern is identical to Phase 2A's:
project-scoped tables walk back to `can_access_project(project_id)` (via the FK chain where
the table has no `project_id` column of its own — e.g. `script_variants` walks through
`scripts.project_id`), and writes are gated to `is_ima_manager()`. The one new shape this phase
introduces is **insert-only** tables (no UPDATE policy *and* no UPDATE grant): `script_revisions`,
`script_lines`, `prams_wording_groups`, `prams_workbook_import_diffs` — these are where "never
destructively overwrite history" is enforced at the database, not by convention. See
`docs/phase-2b-limitations.md` and `supabase/tests/rls.test.mjs` §§7–11 for what's proven and
how.

## Migration files

```
20260731090000_phase2b_prechecks.sql
20260731090100_standard_radio_scripts.sql
20260731090200_prams_matrix.sql
20260731090300_prams_imports.sql
20260731090400_prams_wording_functions.sql
20260731090500_phase2b_grants.sql
```

`20260731090500_phase2b_grants.sql` exists for the same reason Phase 2A needed
`20260730190500_grants.sql`: `grant all on all tables in schema public to service_role` only
applies to tables that exist at the moment it runs, not retroactively — every Phase 2B table
created after that point needed its own `service_role` grant, discovered via a `permission
denied for table prams_matrix_rows` error during development and fixed by re-running the
blanket grant now that all Phase 2B tables exist.
