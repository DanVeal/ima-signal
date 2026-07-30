# Phase 2B — Known Limitations

Phase 2B builds the persistent script and PRAMS structure behind the approved frontend:
Standard Radio's script/variant/revision/line chain, and the PRAMS matrix/wording/import
model. Per this round's explicit scope cut, it deliberately does not touch audio upload,
storage, transcription, comments, approvals, notifications, or background jobs — those remain
open for a future phase. This document is the honest map of what's incomplete, provisional, or
was discovered to behave differently than expected along the way.

## Discovery: a project can never be deleted once it has logged any activity

The pre-check hardening (`docs/phase-2b-schema.md`) added a trigger that unconditionally
rejects UPDATE/DELETE on `activity_events`, for every role including `service_role` — this is
exactly what "append-only at the database level, not just via RLS" requires, and
`supabase/tests/rls.test.mjs` §10 proves it directly.

A consequence, discovered while building this phase's test suite: **every** `projects` row
gets an `activity_events` row the instant it's created (the Phase 2A `projects_log_created`
trigger), and `activity_events.project_id` cascades (`on delete cascade`). Since the
append-only trigger rejects *every* DELETE unconditionally — including one arriving via a
cascade from a parent-row delete — **a project can never be deleted again once it exists**, by
anyone, including the service-role client. This was surfaced concretely when
`supabase/tests/import.test.mjs`'s throwaway test projects, and `supabase/tests/rls.test.mjs`'s
pre-existing fixture projects, both turned out to survive their own cleanup calls silently
(the `DELETE` errors, but neither test suite had checked for that error).

This is treated as **correct, not a bug** — it's the literal consequence of the append-only
requirement being real rather than a convention, and reversing it would mean re-opening the
exact gap the pre-check was written to close. Two concrete adjustments were made because of it:

- `supabase/tests/import.test.mjs` and `rls.test.mjs` no longer attempt to delete their
  throwaway top-level `projects` rows (the attempt was silently failing before; it's now
  either removed or, where a unique `job_number` was needed per run, replaced with a run-scoped
  suffix so repeated test runs don't collide with un-deletable leftovers from a prior run).
  Tests that create throwaway *child* rows instead (a `scripts` row, a `prams_matrix_rows`
  row) clean those up successfully — deleting a script or a matrix row doesn't cascade into
  `activity_events`, only deleting a project does.
- `getProjects()` (`src/lib/supabase/repository.ts`) orders by `created_at` rather than `name`,
  so the `/prams-registry` and `/scripts-registry` proof pages (below) always resolve to the
  real seeded project — created at `db reset` time, before any test ever runs — rather than an
  alphabetically-earlier or more-recent leftover test fixture.

Practical upshot for local development: `supabase db reset` is the only way to actually clear
these fixtures, exactly as it already was for Phase 2A. There is no cleanup job, and none is
planned — a real deletion/retention policy remains the open question flagged in
`docs/phase-2a-limitations.md`, now with a sharper edge (it's not just "no policy exists yet",
it's "the current schema cannot support one for any project with logged activity" without
either an exception in the trigger or an archival/anonymisation strategy that doesn't require
deletion).

## The frontend still runs on two data sources at once, by design — now four live pages

Following Phase 2A's `/people` and `/prams-registry` precedent, Phase 2B adds:

- `/prams-registry` (extended) — now also shows the Boarding matrix's **current** wording
  groups live, alongside Phase 2A's registry/section summary.
- `/scripts-registry` (new) — the Standard Radio script → variant → revision → lines chain,
  live.

Every other page — the dashboard, `/projects`, `/projects/[projectId]/...` (the Boarding
matrix, the announcement-variant review workspace, the bulk-import prototype, all Standard
Radio project pages) — is **untouched** and still reads `src/lib/mock/`. This is a direct
continuation of Phase 2A's own reasoning, not an oversight: those pages' ids, and their
cross-referenced audio/comment/approval state, still come entirely from the mock prototype,
because `audio_items`/comments/approvals don't exist in the database at all yet (out of scope
for this round too). Wiring live matrix/script data into the *same* mock-driven pages would
produce a page that's silently half-real, half-fabricated — worse than an honest, clearly
separate proof. Replacing those pages wholesale is future work once the reviewable-item
pipeline (audio, comments, approvals) exists to back the rest of what they render.

**Consequence, unchanged from Phase 2A:** don't read anything into the dashboard, projects
list, or any `/projects/[projectId]/...` page as evidence of what's in the real database —
check `/people`, `/prams-registry`, `/scripts-registry`, or query Postgres/Studio directly.

## Import commit is not one database transaction

Covered in detail in `docs/phase-2b-import.md`. In short: `confirmImport` is a sequence of
`supabase-js` calls, not a single Postgres transaction (no cross-statement transaction API
exists in `supabase-js`), accepted because every write in it is additive or a soft-status flip
— never a delete — and the whole operation is already gated behind an explicit human
preview-then-confirm step. The three wording operations (`edit_shared_wording`,
`create_variant_override`, `remerge_wording_cells`) don't share this limitation — they're each
one Postgres function call, and therefore genuinely atomic.

## No generic "log every structural change" system

Same limitation Phase 2A flagged, still true: `edit_shared_wording`, `create_variant_override`,
`remerge_wording_cells`, and `confirmImport` each hand-log their own `activity_events` row with
hand-built metadata. There's no generic diff-to-activity-event mechanism; every future
structural-change workflow (audio versions, comments, approvals) needs to add its own explicit
logging until/unless a generic mechanism is built.

## Workbook re-import has no conflict-resolution UI yet

The service layer (`previewImport`/`confirmImport`) and its diff model fully support
re-importing a revised workbook — see `docs/phase-2b-import.md` for what's proven. What
doesn't exist yet is a frontend screen that renders that diff for a human to review before
confirming (Phase 2A's bulk-import prototype under `/projects/[projectId]/import` is still
the mock-driven placeholder UI). The plan explicitly allows this: "This can be backend and
service-layer only in Phase 2B, with a minimal frontend proof" was written for structural
comparison, and the same reasoning was extended here — the backend behaviour is what this
phase's tests prove, not a finished review screen.

## Structural comparison is read-only and has no frontend at all

`src/lib/prams-matrix/comparison-service.ts`'s `compareUpdates()` is exercised directly by
`supabase/tests/comparison.test.mjs` against the real July-vs-October seeded data, per the
plan's explicit allowance for "backend and service-layer only... with a minimal frontend
proof." No frontend proof was added for this one specifically (unlike the matrix/scripts proof
pages) — the two proof pages already added, plus the automated test, were judged sufficient
signal for this round; a comparison UI is future work.

## Docker and Supabase CLI availability

Unchanged from Phase 2A: built and verified only against a local Supabase stack. Storage,
Realtime, Edge Functions, and Analytics remain disabled in `supabase/config.toml`. There is
still no hosted Supabase project or shared staging environment.

## RLS coverage added this phase, and what it still doesn't cover

`supabase/tests/rls.test.mjs` §§7–11 prove: Standard Radio write-gating and revision/line
immutability; PRAMS matrix/import write-gating; the wording RPC functions rejecting non-IMA
callers; `activity_events` append-only under `service_role` directly; and reference-code
normalisation as a standing regression test. What's still not encoded anywhere is the
finer-grained workflow rule from the Phase 2 plan (only a Jet2 reviewer may decide while a
project is `ready_for_jet2_review`, etc.) — RLS here still only enforces tenant isolation and
role-class write-gating (`is_ima_manager()`), not multi-condition state-machine rules. That
remains an application/edge-function-layer concern with no home yet, exactly as Phase 2A
documented.
