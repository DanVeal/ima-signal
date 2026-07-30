# Phase 2A — Known Limitations

Phase 2A is a backend **foundation**: auth, roles, RLS, projects, and the PRAMS identity
registry, proven against a real local Supabase stack. It deliberately does not extend into
the reviewable-item pipeline (scripts, audio, transcripts, QC, comments, change requests,
approvals) or the PRAMS matrix/wording model — those are Phase 2B, per the approved plan
(`docs/phase-2-implementation-plan.md`) and this round's explicit scope cut. This document
is the honest map of what that leaves incomplete or provisional.

## The frontend runs on two data sources at once, by design

- `/people` and `/prams-registry` read **real** data from Supabase (organisations,
  user_profiles, projects, the PRAMS registry/sections).
- Every other page — the dashboard, the projects list, project detail pages, the Boarding
  matrix, the announcement-variant review workspace, the bulk-import prototype — still
  reads **mock** data from `src/lib/mock/`, exactly as before this round.

This isn't an oversight; it's a direct consequence of the mock prototype's ids
(`"proj-prams-july-2026"`, `"v080"`, ...) not being the same ids as the real database's
UUIDs. Swapping the data source for, say, the projects list, would require every other mock
function that takes a project id as a foreign key (`getScriptsForProject`,
`getActivityForProject`, `getProjectProgress`, ...) to resolve against real rows too — and
those tables (`scripts`, `audio_items`, ...) don't exist yet. Half-migrating one page while
its cross-referenced data stays mock would produce a page that's silently broken or
misleading, not a proof that the foundation works. `/people` and `/prams-registry` were
chosen specifically because their rendering has no dependency on any table that doesn't
exist yet — they're a complete, honest vertical slice rather than a partial one.

**Consequence:** don't read anything into the dashboard, projects list, or any
`/projects/[projectId]/...` page as evidence of what's in the real database — check
`/people`, `/prams-registry`, or query Postgres/Studio directly.

## The role-preview switcher is still separate from the real session

Real Supabase Auth now gates every route (`src/proxy.ts` redirects to `/login` without a
session), and every Supabase query goes through real RLS as that signed-in user. The
existing "Previewing as" switcher (top-right avatar menu) is unchanged: it still lets you
see the UI render as a different mock role, entirely client-side, with zero effect on what
the real session can actually do. This is intentional — reconciling the demo switcher with
the real session (e.g. replacing it with real per-user account switching, or removing it
once every page is real) is Phase 2B+ scope, not "minimum necessary to prove the foundation
works." Both `src/lib/demo-user-context.tsx` and `src/components/nav/role-switcher.tsx`
have comments explaining this.

## No workbook import, so the architecture decision is proven structurally, not behaviourally

The Phase 2 review's global-registry architecture decision (`prams_announcements` +
`prams_announcement_versions`, see `docs/phase-2a-schema.md`) is implemented and seeded, and
the two-table split is real. But the actual *workflow* it exists to support — importing a
revised workbook, detecting a reference-code change and flagging it for manual confirmation
rather than auto-linking, marking a reference `removed` from an update without deleting it —
isn't built yet, because there's no workbook import at all in Phase 2A. What's here proves
the data model can hold that behaviour; it doesn't yet prove the behaviour.

## Docker and Supabase CLI availability

This was built and verified against a **local** Supabase stack (`supabase start`, Docker
containers on this machine) — Storage, Realtime, Edge Functions, and Analytics are disabled
in `supabase/config.toml` since Phase 2A doesn't use them (re-enable when Phase 2B needs
Storage for audio files). There is no hosted Supabase project yet. Before Phase 2B assumes
a shared staging environment exists, one needs to be provisioned and these same migrations
applied to it (`supabase link` + `supabase db push`, or equivalent).

## Auditability is demonstrated, not comprehensive

`activity_events` is genuinely append-only (enforced by RLS having no UPDATE/DELETE policy,
not just convention), and two triggers (`projects_log_created`,
`prams_announcement_versions_log_removed`) show the pattern. A general-purpose "log every
structural change automatically" system — needed once workbook-import diffing exists, per
the Phase 2 plan's auditability requirement — is not built. Every future migration that adds
a structural-change workflow should add its own explicit logging until/unless a generic
mechanism is built.

## Business-rule enforcement beyond tenant isolation doesn't exist yet

RLS in this schema enforces *tenant isolation* (who can see/write rows for which
organisation) via `can_access_project`/`is_ima_manager`. It does not yet enforce
finer workflow rules like "only a Jet2 reviewer may approve while status is
`ready_for_jet2_review`" — those rules have no home yet (no approvals table, no
application/edge-function layer). The Phase 2 plan's intent (RLS for isolation,
an application layer for workflow rules, RLS as backstop not primary mechanism) is
documented but not implemented.

## Retention, deletion, and multi-studio are unresolved, not deferred silently

`projects`/`prams_updates` etc. have `deleted_at`/soft-delete columns ready, but no
retention policy or deletion job exists — this was already flagged as an open legal/
commercial question in the Phase 2 plan (§17) and remains open. Similarly, RLS's studio
scoping is implemented and tested against two studios (see `docs/phase-2a-rls.md`'s
cross-studio isolation test), but only one studio (Coastal Sound Studios) exists in the
real seed data — a second studio being onboarded for real is untested beyond that one
synthetic RLS assertion.
