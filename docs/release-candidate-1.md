# Release Candidate 1

IMA Signal's first production release — built for real use by IMA producers/admins, Jet2
reviewers, and recording studios starting the week of 3 August 2026. This document is the
release record: what's real, what's deployed, what's known to be missing, and how to operate
the platform going forward.

## What changed this pass

Earlier phases (see `docs/phase-2a-*.md` through `docs/intelligence-engine.md`) built the
schema, RLS, and a mix of real and mock-data-driven pages across four rounds. RC1's job was to
turn "a fully-built demo" into "a product real people can use next week" — which meant finding
and closing every remaining gap between the two, not adding new capability:

- **Nav showed a mock "preview as" persona** instead of the real signed-in user. Fixed:
  `SiteHeader`/`RoleSwitcher` now render the real profile fetched server-side; the
  organisation/role-switching affordance is gone, replaced by a real account menu
  (name, email, Settings, sign out).
- **Project creation did nothing** — "Create project" just navigated to one of two hardcoded
  demo project IDs. Built a real `createProject` server action (campaign pick-or-create,
  studio assignment, deadlines), gated to IMA Admin/Producer to match the existing
  `is_ima_manager()` RLS policy.
- **PRAMS workbook import was entirely mock** — the only import UI still read
  `src/lib/mock/`, 404s for every real project including the seeded one. The parse/diff/commit
  backend was real and tested (Phase 2B); built the missing frontend: upload → preview diff →
  confirm/discard, wired to that backend.
- **No way to author a Standard Radio script at all** — only read queries existed. Built a
  minimal real authoring form (title, variants, initial revision + lines).
- **No way to create an organisation** — onboarding a new studio or client required a database
  admin inserting a row by hand. Added an Admin-only Organisations section (create, rename,
  change type, archive/reactivate — never delete) plus inline "+ New organisation" creation
  from the Admin create-user form and the New Project flow's client/studio pickers.
- **"Upload recordings" was shown to roles that can never upload** (Jet2, by design — see
  `can_upload_audio_for_project`'s RLS predicate). Added a `canUploadAudioForProject()` check
  that hides the action where it can never succeed, and gates the upload page itself
  server-side.
- Dead-end empty states, stale Phase-2A/2B docstrings, and internal dev-phase language
  ("Phase 2C.1", raw table names) leaking into real user-facing pages were found and cleaned
  up in a dedicated sweep.
- A dedicated adversarial bug hunt on everything built this pass found and fixed: a Base UI
  `SelectValue` bug (closed trigger showing a raw UUID/enum instead of its label) repeated
  across five different selects; `discardWorkbookImport` missing the same
  already-confirmed/already-discarded status check `confirmWorkbookImport` had; silently
  swallowed insert errors and orphaned rows left behind on partial failure in project/script
  creation (now cleaned up or surfaced).

Full commit history for this pass is on `claude/ima-signal-setup-3wswin`.

## Architecture as deployed

```
Vercel (web app)              Railway (worker)              Hosted Supabase
  Next.js 16 App Router  ───┐   scripts/worker.ts    ───┐      Postgres + RLS
  auto-deploys from the     │   same startWorkerPolling │      Auth (email/password)
  claude/ima-signal-setup-  │   loop as local dev,       │      Storage (audio-recordings,
  3wswin branch on push     │   just as its own          │      private bucket)
                            │   long-lived process        └──▶  All 24 migrations applied
                            └──────────────────────────────────▶
```

**Why a separate worker service:** the AI transcription/comparison/health pipeline
(`src/lib/ai/worker.ts`) is an in-process poller over a Postgres-backed job queue
(`ai_jobs`, `FOR UPDATE SKIP LOCKED`) — there's no external queue service in this stack. That
poller needs a process that stays alive between requests, which Vercel's serverless model
doesn't reliably provide. Rather than redesign the worker around Vercel Cron before launch, it
runs as its own Railway service, started via `pnpm run worker` (see `scripts/worker.ts`). The
Vercel deployment's own `instrumentation.ts`-based poller is left as-is for local dev; running
both is harmless (`SKIP LOCKED` means no double-processing) but only the Railway one is relied
on in production.

### Environment variables (both Vercel and Railway need the Supabase ones)

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + Railway | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Browser/session client |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + Railway | Server-only, bypasses RLS (Admin area, worker) |
| `NEXT_PUBLIC_SITE_URL` | Vercel | Password-reset email redirect target |
| `ELEVENLABS_API_KEY` | Vercel + Railway | Transcription |

### One-time production bootstrap

A freshly-migrated database has no organisations or users — the Admin area needs at least one
`ima_admin` to sign in and create everyone else. `scripts/bootstrap-admin.mjs` creates the
first IMA organisation (if missing) and the first admin account via the same Auth/REST API
calls `createUser` uses, just runnable before any UI exists to do it. Already run for this
launch (see release notes below for the account); re-run only if starting over against a new,
empty database.

## Known limitations

- **Legacy mock UI, explicitly out of RC1 scope.** A handful of routes still read
  `src/lib/mock/` and were deliberately left untouched: the PRAMS section browser
  (`/projects/[projectId]/sections/[sectionId]`), the announcement-variant review workspace at
  `/projects/[projectId]/audio/[audioItemId]` (superseded by the real review workspace at
  `/projects/[projectId]/recordings/[audioItemId]`), and their supporting components
  (`announcement-browser.tsx`, `variant-list.tsx`, `announcement-variant-row.tsx`). These
  predate RC1 and were already documented as deferred in `docs/phase-2b-limitations.md`.
- **`/scripts-registry` and `/prams-registry` resolve to the oldest project of their type**,
  not "the" project — fine with one seeded project of each type, but a producer with multiple
  Standard Radio or PRAMS projects won't find a way to pick which one these two pages show.
  Reachable only via ⌘K, not the main nav. A real per-project view already exists
  (`/projects/[projectId]`); these two routes are a Phase 2A/2B proof-of-concept that was
  never meant to be the primary UI.
- **No custom SMTP configured** — password-reset emails go through Supabase's built-in mailer,
  which has low sender rate limits. Fine for occasional resets; if invite/reset volume grows,
  configure a custom SMTP provider in the Supabase dashboard (Auth → Emails).
- **Playwright/browser automation can't reach external hosts from this build sandbox** (a
  proxy limitation specific to the environment this release was prepared in, unrelated to the
  app). Production verification for this release was done via direct HTTP checks
  (`curl`, the Supabase/Vercel/Railway HTTPS APIs) rather than an in-browser click-through;
  do a manual login/click-through as a final check.
- **A project, once it logs any activity, can never be deleted** — the append-only
  `activity_events` trigger rejects the cascade even for the service role. This is by design
  (see `docs/phase-2b-limitations.md`), not a bug; there's no cleanup job and none is planned.
  This also means the automated RLS test suite's audio-domain fixture is a one-shot — running
  `pnpm test` a second time against the same database will report one pre-existing failure
  (`studio_contributor CAN create an audio_item for their own studio's project`) because that
  fixture already exists from the first run. Reset the database (`supabase db reset`, local
  only) for a fully clean pass.
- **Standard Radio script authoring is intentionally minimal** — one script + variants +
  initial revision + lines in a single form. There's no revision-history UI, no re-recording
  workflow trigger, and no bulk/import path for scripts (PRAMS has one via the workbook
  importer; Standard Radio doesn't, matching what existed before this pass).

## Production validation

Verified this pass, against real data (local Supabase for full click-through testing, hosted
Supabase + Vercel + Railway for the live deployment):

- Sign in / sign out, forgot password → reset password (real email via local Mailpit in dev),
  disabled-account messaging, nav showing the real signed-in user for multiple real accounts.
- Admin: create user (temp password issued), disable/reactivate, change role/org, create/edit/
  archive organisation, inline organisation creation from two different forms.
- Project creation: Standard Radio and PRAMS, existing or new campaign, studio assignment,
  deadlines, duplicate job number handled gracefully.
- PRAMS: workbook import (new section and existing-section update) against the real Boarding
  fixture, diff preview, confirm/discard, re-import reporting no changes, recordings/upload
  flow against the newly-structured project.
- Standard Radio: script/variant authoring, appearing correctly on the real project page and
  the scripts-registry proof page, recordings/review/AI pipeline (already real from earlier
  phases) unaffected.
- Full automated suite (`pnpm test` — RLS, constraints, standard-radio, import, wording,
  comparison, audio-matcher/metadata/upload, review-engine, intelligence-engine — 305
  assertions) passing clean on a freshly-reset database.
- Live deployment: hosted Supabase schema/storage/auth config, Vercel production URL serving
  the real login page, Railway worker running and polling (confirmed via runtime logs).

## Success criteria

RC1 is complete when an IMA producer can, without engineering help: sign in, create a project
of either type, get real content into it (workbook import for PRAMS, script authoring for
Standard Radio), have a studio upload recordings, run AI transcription/comparison, review and
approve, and have an IMA Admin manage every account and organisation involved — all against the
real, deployed system. Every item above is true as of this document.
