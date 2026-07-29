# IMA Signal

**From script to approved audio.**

IMA Signal is the single source of truth for Jet2 radio production — project briefs, scripts and
script versions, audio uploads and versions, transcription, script-versus-recording QC, review
comments, change requests, approvals and full activity history — for IMA, Jet2 and IMA's recording
studio partners.

## Status: Phase 1 — Product foundation and visual system

This phase establishes the design system, application shell and three flagship screens
(Dashboard, Project overview, Audio review) against realistic seeded demo data. **There is no
Supabase, authentication, storage or external API connected yet** — every screen reads from
in-memory mock data in `src/lib/mock/`, and a client-side "Previewing as" switcher in the header
simulates signing in as any of the seeded users so role-aware navigation and permissions can be
reviewed before real auth exists.

## Stack

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS v4
- shadcn/ui (`base-nova` / Base UI primitives) as a component foundation, restyled via the design
  token layer in `src/styles/tokens.css`
- Planned for later phases: Supabase (Postgres, Auth, Storage, RLS), ElevenLabs Speech-to-Text,
  Resend, Vercel, Vitest, Playwright

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Use the "Previewing as" menu in the header
(top right) to switch between seeded IMA, Jet2 and Coastal Sound Studios users and see navigation
and permissions change accordingly.

### Other scripts

```bash
pnpm build        # production build
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
```

## Project structure

```
src/
  app/(app)/            # authenticated route group — nav shell wraps every page here
    page.tsx            # Home / dashboard
    projects/           # project list, project overview, audio review (flagship screen)
    review-queue/  activity/  people/  settings/
  components/
    ui/                 # shadcn primitives
    brand/              # Logo, SignalDot — the one place brand marks live
    status/             # status/severity/deadline/confidence badges (icon + text, not colour-only)
    states/             # EmptyState, ErrorState, PermissionDeniedState, loading skeletons
    nav/                # AppShell, SiteHeader, RoleSwitcher, PageContainer/PageHeader
    layout/             # Panel (shared section-card pattern)
    dashboard/  projects/  audio/  transcript/  comments/  change-requests/  activity/  settings/
  lib/
    mock/               # demo organisations, users, projects, scripts, audio, QC, comments…
    demo-user-context.tsx       # Phase-1-only "previewing as" simulation
    audio-playback-context.tsx  # shared playback clock for the review screen
    format.ts  comment-categories.ts  local-id.ts  utils.ts
  styles/tokens.css      # design tokens: colour, type, spacing, radius, shadow, motion, layout
  types/domain.ts        # domain types mirroring the planned Supabase schema
```

## Design system

All colour, spacing, radius, shadow and motion values are centralised in `src/styles/tokens.css`
and mapped onto Tailwind utilities (and shadcn's primitive variables) in `src/app/globals.css`.
Brand colours are placeholders — marked `TEMP_BRAND_*` — pending official IMA brand assets;
swapping them later only means editing `tokens.css`, not touching component code.

- **Brand primary** (`brand`): deep control-room teal — primary actions, links, active nav.
- **Signal** (`signal`): warm amber — the recurring "needs attention" indicator (dashboard,
  pending statuses, the `SignalDot` mark next to the logo).
- **Semantic QC/workflow colours**: `success`, `critical`, `important`, `minor`, `uncertain`,
  `comment` — each pairs an icon with its colour so status is never colour-only.

## Demo data

Everything under `src/lib/mock/` is fictional Jet2-style content (a "Winter Sun" and a "Summer
Sale" campaign, five departure-route radio variants, seeded comments, change requests and
approval history) — no real client material.
