# Phase 2C.2 — Review Engine

The human review workflow at the heart of IMA Signal: listen to a recording, read the script it
was recorded against, leave general or timecoded comments, thread replies, resolve/reopen,
request structured changes, approve or withdraw approval — all against the real backend, no mock
data. Explicitly excludes automatic transcription, ElevenLabs, AI-assisted comparison, QC
scoring, notifications, and background processing — those remain future phases (2C.3+).

The recording detail page (`/projects/[projectId]/recordings/[audioItemId]`) is now the review
workspace: Header → Waveform/Playback → Script → Comments (unified, filterable feed) → Activity
→ Version history, with a sidebar of participants, open items, and approval state. See
`src/components/reviews/review-workspace.tsx`.

## Architecture

Eight new tables (`supabase/migrations/20260731120000_review_domain.sql`), designed around one
rule stated in the brief: **everything is append-only, nothing is overwritten.** Three patterns
recur, matching precedent already set by Phase 2B/2C.1:

1. **Pure insert-only event logs**, where "current state" is derived from the latest row —
   `comment_thread_resolutions` (resolved/reopened) and `approvals` (approved/changes_requested/
   withdrawn). This is why there's no separate "Approval History" table: an insert-only decision
   log already *is* its own history.
2. **A narrow, explicitly-audited mutable status column**, changed only via an RPC function that
   logs every transition to `activity_events` — `reviews.status` and `change_requests.status`,
   matching the existing `prams_workbook_imports.status` precedent from Phase 2B.
3. **An editable "live" column with a companion history table captured before every overwrite** —
   `comments.body`, whose every prior value is written to `comment_edits` immediately before the
   update. Live rendering stays simple; nothing is ever actually lost.

```
reviews                    — one row per audio_item, auto-created the instant it exists
  audio_item_id (unique FK)
  status (review_status)   — the one mutable column here; every transition is RPC-gated + logged

review_participants        — insert-only: one row per (review, user) on first review action
  review_id, user_id, role_at_time (snapshotted, not live)

comment_threads             — the anchor for a conversation; immutable once created
  audio_item_id, audio_version_id, is_timecoded, start_ms, end_ms, created_by_user_id

comments                    — flat replies within a thread (no nested sub-threads)
  thread_id, author_user_id, body, mentioned_user_ids, edited_at, deleted_at

comment_edits                — insert-only: previous_body captured before every edit
comment_thread_resolutions   — insert-only: resolved/reopened events

approvals                    — insert-only decision log, one row per decision
  audio_item_id, audio_version_id, decision (approved/changes_requested/withdrawn)

change_requests               — a structured, categorised required change
  audio_item_id, audio_version_id, category, message, timecode_ms, priority, status
```

`activity_events` (from Phase 2A) gained one nullable `audio_item_id` column rather than
spawning a parallel "Review Activity" table — the recording page's unified timeline just filters
on it directly (`eq('audio_item_id', id)`), and every new RPC function logs through it exactly as
every previous phase's functions already did for their own domains.

A trigger (`audio_items_create_review`, firing `after insert on audio_items`) auto-inserts the
matching `reviews` row the instant an `audio_item` exists, so "does a review exist for this
item?" is never a question the application has to ask.

### API surface

Repository/service layer only, per the brief — no frontend database logic:

- `src/lib/review/queries.ts` — every read (script lines, review, participants, comment threads
  with derived resolution state, approvals with derived current-standing-per-version, change
  requests, activity, permissions, mentionable users). Plain functions taking a Supabase client;
  RLS enforces access exactly as everywhere else in this codebase.
- `src/lib/review/service.ts` — one function per RPC (`postComment`, `editComment`,
  `softDeleteComment`, `resolveThread`, `reopenThread`, `createApproval`, `withdrawApproval`,
  `createChangeRequest`, `resolveChangeRequest`, `cancelChangeRequest`, `startReview`,
  `archiveReview`).
- `src/lib/review/actions.ts` — thin `"use server"` wrappers over `service.ts`, run as the
  signed-in user's own request-scoped client (never service role), each revalidating the
  recording page's path after a mutation.

## Comment model

**General vs. timecoded** is one flag on the thread (`is_timecoded`), not two different tables —
a general thread has `start_ms`/`end_ms` both null; a timecoded thread requires `start_ms` (a
check constraint enforces the shape). `post_comment(p_thread_id, ...)` is the single entry point
for both starting a new thread and replying to an existing one: pass `p_thread_id = null` to
start one, or an existing id to reply — the natural shape for a comment composer that does both.

**Editing** overwrites `comments.body` and sets `edited_at`, but only after the *old* body is
written to `comment_edits` — full history survives every edit. RLS restricts the UPDATE to the
comment's own author (`comments_update_own`); the RPC additionally checks the affected row count
and raises an explicit exception if it's zero, so a blocked edit attempt fails loudly rather than
silently no-op'ing (see "A real bug this caught" below).

**Deleting is soft-delete only** — `deleted_at` is set, the row and its `body` are retained. The
UI renders a "Comment removed" placeholder once `deleted_at` is set rather than actually hiding
the row, so a resolved thread's full conversation (including anything later removed) is never
silently truncated.

**Mentions** are stored as `mentioned_user_ids uuid[]` on the comment, extracted client-side from
`@handle` text in the composer (`src/components/reviews/comment-composer.tsx`) against the
project's mentionable users (`getMentionableUsersForProject` — every IMA/Jet2 user, plus the
assigned studio's own users, mirroring `can_access_project`'s tenancy rule). Mentions do not
currently trigger a notification — see Known limitations.

**Resolution** is a pure insert-only log (`comment_thread_resolutions`, action
`resolved`/`reopened`) rather than a boolean column — a thread's live state is simply the action
of its most recent row (or "open" if none exist), so resolving and reopening the same thread
multiple times loses none of that history.

## Approval model

**Approvals are an insert-only decision log**, one row per decision, always naming the exact
`audio_version_id` it was made against. There is no separate "Approval History" entity — this
table already is the history. Withdrawing an approval is a **new row** (`decision = 'withdrawn'`),
never an update to the row being withdrawn.

**A decision can only ever be made against an item's CURRENT version** — `create_approval` and
`create_change_request` both raise an exception if `p_audio_version_id` doesn't match
`audio_items.current_version_id`. This is what makes "a new audio version invalidates previous
approvals automatically" true without ever mutating or deleting the historical approval row: the
old decision simply can no longer be *acted on*, while remaining fully visible.

**Superseding** happens via `reviews.status`, updated inside `create_audio_version` and
`restore_audio_version` (both `CREATE OR REPLACE`d from Phase 2C.1 to add this): if the review's
status was `approved`, a new version moves it to `superseded`; any other status moves it to
`ready_for_review` (a fresh take genuinely is ready for a fresh look). The historical approval
itself is untouched — `getApprovalsForAudioItem` returns both the full `history` and a
`currentStandingByVersion` map, so "Current Version / Previous Versions / Superseded" can always
be shown clearly, and an approval always visibly names which version it was granted against.

**Approve vs. Request Changes as an approval decision** is distinct from the separate **Change
Requests** entity: `create_approval(..., 'changes_requested')` is Jet2/IMA recording an overall
"this needs work" verdict against a version (shows up in the Activity feed as
`approval_changes_requested`, moves `reviews.status`), while `change_requests` are individual,
structured, categorised items (wording / pronunciation / pacing / music_sound / technical_issue /
general, with a priority) that can accompany that verdict — a single "changes requested" decision
can have several change requests attached. Both use the same current-version-only restriction.

## Permissions

Two SQL predicates, `security definer`, are the actual source of truth — both RLS policies *and*
the frontend's "should I show this button?" logic call the exact same functions, so the UI can
never drift out of sync with what the database will actually allow:

```sql
can_comment_on_review(project_id)   -- comment, reply, resolve/reopen threads, upload
  = is_ima_manager()                                -- ima_admin, ima_producer
    or current_role() in ('ima_reviewer', 'jet2_reviewer')
    or can_upload_audio_for_project(project_id)      -- studio, only for their own project

can_decide_review(project_id)       -- approve, request changes, create/resolve change requests
  = is_ima_manager()
    or (current_role() in ('ima_reviewer', 'jet2_reviewer') and can_access_project(project_id))
```

| Role | Comment | Approve / Request changes | Replace recording |
|---|---|---|---|
| IMA Admin / Producer | ✅ | ✅ | ✅ |
| IMA Reviewer | ✅ | ✅ | ❌ |
| Jet2 Reviewer | ✅ | ✅ | ❌ |
| Jet2 View-only | ❌ (playback only) | ❌ | ❌ |
| Studio Admin / Contributor | ✅ (own project only) | ❌ | ✅ (own project only) |

`ima_reviewer` and `jet2_view_only` aren't named in the brief's four explicit roles; they were
extrapolated consistently — `ima_reviewer` granted the same review powers as `jet2_reviewer`
(both "reviewer"-class roles, distinct from the upload-capable "manager"/"studio" roles), and
`jet2_view_only` excluded from every review-participation function entirely (playback/read-only,
matching its name and Phase 2A's original framing).

`archive_review` is more restrictive than the table-level `reviews` UPDATE policy (which is
deliberately broad, since ordinary status transitions go through several different roles) — it
checks `is_ima_manager()` explicitly inside the function body. This is a documented, narrow
exception to "RLS alone decides": a single table-level policy can't distinguish "which
transition" from OLD/NEW status alone, so the one transition that needs to be *more* restrictive
than the general policy checks itself.

`src/lib/review/queries.ts`'s `getReviewPermissions` calls both predicates via `.rpc()` directly
— the frontend never re-implements the permission matrix in TypeScript.

## Activity

One unified, append-only timeline per recording (`getActivityForAudioItem`, newest first),
reusing the existing `activity_events` table from Phase 2A/2B/2C.1 rather than a parallel "Review
Activity" system. Every RPC function in this phase logs one row per action:

`audio_uploaded`, `audio_version_created`, `audio_version_restored`, `comment_added`,
`comment_edited`, `comment_deleted`, `comment_resolved`, `comment_reopened`, `approval_granted`,
`approval_changes_requested`, `approval_withdrawn`, `change_request_created`,
`change_request_resolved`, `change_request_cancelled`, `review_status_changed`.

Proven end-to-end (all 15 action types, correct newest-first ordering) in
`supabase/tests/review-engine.test.mjs`.

## Versioning

Approvals and change requests are version-scoped (see Approval model above); comment threads
also record the `audio_version_id` they were created against, so a comment made on take 1 stays
visibly attached to take 1 even once take 3 is current — nothing silently moves a comment onto a
newer version's timeline. The recording page always plays the *current* version; historical
threads on superseded versions remain visible in the feed (their timecode badge still seeks the
current player, since audio position is comparable across versions of the same script even if
the exact waveform differs).

## Design

The recording page (`src/components/reviews/review-workspace.tsx` and
`src/components/reviews/*`) follows the brief's reference points — whitespace, editorial
typography, subtle motion, no Jira-style density:

- **Script panel** (`script-panel.tsx`) renders one shape (`ScriptPanelData`, an ordered array of
  `{ sortOrder, text }` lines) regardless of whether the underlying subject is a Standard Radio
  script revision or a PRAMS matrix column for one announcement version
  (`getScriptLinesForAudioItem` in `queries.ts` resolves both to the same shape) — a future
  transcription column can sit beside `lines` without redesigning either side.
- **Waveform** (`src/components/audio/waveform.tsx`) gained comment-marker pins (amber = open,
  green = resolved, larger + highlighted on hover) and a hover-triggered "+" affordance that
  opens a new timecoded comment at the hovered time without disturbing normal click-to-seek
  scrubbing.
- **One unified, filterable feed** (`review-feed.tsx`) — comment threads, change requests, and
  approval decisions interleaved by recency, filterable by exactly the facets the brief named:
  Open, Resolved, My comments, Timecoded, General, Change requests, Approvals.
- **Autosave + unsaved warnings** — the comment composer persists its draft to `localStorage` per
  audio item and warns on navigation away while unsaved text exists
  (`comment-composer.tsx`).
- **No page reloads** — every mutation is a `"use server"` action followed by
  `router.refresh()`, which re-fetches the server-rendered data in place; the audio element
  (`RealAudioPlaybackProvider`, keyed on version id, not on any comment state) stays mounted
  throughout, so **playback genuinely continues while commenting**.
- **Keyboard shortcuts** — space to play/pause, ←/→ to skip 5s (inherited from Phase 2C.1's
  player), ⌘/Ctrl+Enter to submit a comment or reply.

## A real bug this caught

Two categories of bug surfaced while building and testing this phase, both fixed and covered by
`supabase/tests/review-engine.test.mjs`:

**Silent authorization no-ops.** `edit_comment`, `soft_delete_comment`,
`resolve_change_request`, and `cancel_change_request` each perform an `UPDATE ... WHERE id = ...`
gated by RLS to the correct actor. An `UPDATE` whose `WHERE` clause is narrowed to zero rows by
RLS does **not** raise a Postgres error — it just silently affects nothing, and the calling RPC
function would otherwise return success. Fixed by adding `GET DIAGNOSTICS v_row_count =
ROW_COUNT; IF v_row_count = 0 THEN RAISE EXCEPTION ...` immediately after each such `UPDATE`.
Verified directly: `supabase/tests/review-engine.test.mjs`'s permission-matrix section confirms
a non-author's edit/delete attempt, and a non-decider's resolve/cancel attempt, both now raise a
real, specific exception instead of returning a false success.

**A trigger without `SECURITY DEFINER`.** `create_review_for_audio_item()` (the trigger that
auto-creates a `reviews` row) initially ran as `SECURITY INVOKER` — but `authenticated` is
deliberately **not** granted `INSERT` on `reviews` (so no one can create an arbitrary review row
directly; only the trigger should ever do it). The result: any real signed-in user uploading a
brand-new recording for the first time got `permission denied for table reviews`, even though the
same operation worked fine when run as `service_role` (which is how the seed script uploads,
masking the bug until a real authenticated-user upload was tested). Fixed by adding `security
definer set search_path = public`, matching the exact precedent already set by
`log_project_created()`/`log_announcement_version_removed()` in
`20260730190400_activity_events.sql`. Caught by the review-engine test suite's very first
assertion, which uploads as a real signed-in user rather than via the service-role seed path.

## Known limitations

**No notifications.** Mentions (`@handle` in a comment) are stored and rendered, but no email/
push/in-app notification is sent — explicitly out of scope for this phase per the brief
("Do not build notifications").

**No AI-assisted comparison or QC scoring.** The Script panel shows the intended wording side by
side with playback for a human to compare by ear; there is no automatic transcription or
recording-vs-script diff. That's Phase 2C.3+.

**Mention parsing is a simple client-side heuristic**, not a real `@`-autocomplete-and-store-id
flow — it matches `@firstname.lastname`-shaped tokens in the posted text against the project's
mentionable users after the fact. Fine for a small reviewer list; would need a proper
autocomplete-with-stored-id component if the mentionable list grows large or names collide.

**A resolved/reopened thread's history is visible via the database, not yet in the UI.** The
`comment_thread_resolutions` log (who resolved/reopened, and when, across every occurrence) is
fully queried and available, but the current UI only surfaces the *latest* state (open/resolved)
plus the single most recent actor — a "resolution history" expansion per thread is a natural,
small follow-up rather than a re-architecture.

**Script comparison is presentational, not structural.** Unlike Phase 2B's PRAMS matrix
comparison (which diffs structured cell data), the Script panel here is read-only prose — there
is no line-level "does the recording match the script" flag. That requires transcription
(Phase 2C.3), which this phase explicitly does not build.

**The existing mock-driven `/projects/[projectId]/audio/[audioItemId]` page is untouched**, same
reasoning as every previous phase: it's a different route from the real
`/recordings/[audioItemId]` workspace built here, kept for the same reason Phase 2C.1 left it —
out of this phase's scope, not a regression.
