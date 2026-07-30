# Phase 2A — Environment Setup

How to bring up the Phase 2A backend foundation locally, and how it's wired into the
frontend.

## Prerequisites

- Docker (the local Supabase stack runs as containers — Postgres, GoTrue/Auth, PostgREST,
  Studio, Kong). Storage, Realtime, Edge Functions and Analytics are disabled in
  `supabase/config.toml` — Phase 2A doesn't need them (see `docs/phase-2a-limitations.md`).
- Node 22+, pnpm.
- The Supabase CLI, invoked via `npx supabase` (no global install required).

## First-time setup

```bash
pnpm install
npx supabase start          # pulls images on first run; prints local URLs/keys
cp .env.example .env.local  # local-only demo keys — see note in that file
pnpm run test:rls           # optional: proves RLS end-to-end (see below)
pnpm dev
```

`supabase start` prints connection info every time it runs. The local stack's URL/keys are
**fixed, publicly-documented Supabase CLI defaults** — identical for every local Supabase
project on this machine, safe to keep in `.env.example`. They do not work against any
hosted project.

## Everyday commands

| Command | What it does |
|---|---|
| `npx supabase start` / `stop` | Start/stop the local stack (containers persist data between starts) |
| `npx supabase db reset` | Drop and recreate the local DB, re-run every migration in `supabase/migrations/`, then re-run `supabase/seed.sql` |
| `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts` | Regenerate TypeScript types after any schema change |
| `pnpm run test:rls` | Run the automated RLS test suite against the local stack (see `docs/phase-2a-rls.md`) |
| Studio UI | `http://127.0.0.1:54323` — browse tables, run SQL, inspect auth users |

## Seeded accounts (local development only)

`supabase/seed.sql` creates one real Supabase Auth user per mock person from
`src/lib/mock/data.ts`, all sharing one password so they're easy to sign in as while testing:

| Email | Role | Organisation |
|---|---|---|
| priya.anand@ima.global | ima_admin | IMA |
| tom.radcliffe@ima.global | ima_producer | IMA |
| sasha.lindqvist@ima.global | ima_reviewer | IMA |
| helen.marsh@jet2.com | jet2_reviewer | Jet2 |
| craig.osei@jet2.com | jet2_reviewer | Jet2 |
| fatima.iqbal@jet2.com | jet2_view_only | Jet2 |
| ben.foster@coastalsound.studio | studio_admin | Coastal Sound Studios |
| ellie.nakamura@coastalsound.studio | studio_contributor | Coastal Sound Studios |

**Password for all of them: `devpassword123`.** This is intentionally simple and must never
be used outside a local stack — there is no production Supabase project yet.

## Environment variables

See `.env.example`. Four variables, all consumed by `src/lib/supabase/`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by both the browser
  client (`client.ts`) and the server client (`server.ts`); every query through these
  respects RLS as the signed-in user.
- `SUPABASE_SERVICE_ROLE_KEY` — used only by `service.ts` (server-only, bypasses RLS).
  Never expose this to the browser; there is no `NEXT_PUBLIC_` prefix on it for that reason.
- `SUPABASE_DB_URL` — direct Postgres connection, used by the RLS test suite's service-role
  fixture setup and by `supabase db` CLI commands.

## Signing in

The app now requires a real session for every route except `/login` (enforced in
`src/proxy.ts` — Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`, see that
file's comment). Visit the app, you'll be redirected to `/login`; sign in with any account
above. The existing role-preview switcher (top-right avatar menu) is unchanged and still
lets you preview the UI as a different mock role — see
`docs/phase-2a-limitations.md` for why that's still separate from the real session.

## Running the RLS test suite

```bash
pnpm run test:rls
```

This signs in as six of the seeded users via the real Auth API and runs 20 assertions
against the real PostgREST API (not a mock) — see `docs/phase-2a-rls.md` for what it
proves. It creates and cleans up its own temporary fixtures (a second studio organisation,
a couple of test projects) via the service-role client, so it's safe to run repeatedly.
