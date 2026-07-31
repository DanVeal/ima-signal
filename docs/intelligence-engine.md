# Phase 2C.3 — Intelligence Engine

Signal assists, people decide. This phase adds automatic transcription (ElevenLabs), script-vs-
transcript comparison with classified differences, pronunciation flags, and a Recording Health
summary — integrated directly into the Phase 2C.2 review workspace. Nothing here ever edits a
script, edits a comment, or approves/rejects a recording: every table this phase adds stores an
AI **observation**, never a decision. The one thing capable of moving a review forward is still,
exactly as before, a human clicking Approve.

## Architecture

Eight new append-only tables (`supabase/migrations/20260731130000_intelligence_domain.sql`),
following the same three patterns Phase 2C.2 established:

```
ai_model_metadata          — de-duplicated reference: exact provider/model/version/prompt config
ai_jobs                     — the durable queue; one row per unit of work, retried in place

transcripts                 — one row per audio_version, current-version pointer
transcript_versions         — one immutable transcription result; never overwritten
transcript_segments         — timestamped segments + word-level timing/confidence

comparison_results          — one comparison run of (transcript_version, script_revision)
comparison_findings         — one classified aligned unit of the diff, in document order

pronunciation_findings      — a flagged word, never an assertion

recording_health_snapshots         — a summary of findings, never a verdict
recording_health_category_scores   — one row per category (transcript match, pronunciation, ...)
```

Every result table carries `audio_version_id` (or reaches it via a join), `transcript_version_id`
where relevant, `ai_job_id`, and `ai_model_metadata_id` — "every AI result must reference the
exact recording version, transcript version, model, timestamp, and confidence" is structural,
not a convention someone has to remember to follow.

`transcripts`/`transcript_versions` mirror `audio_items`/`audio_versions` exactly: one identity
row per audio_version with a `current_transcript_version_id` pointer, immutable version rows
underneath. Regenerating a transcript never overwrites the old one — it inserts version N+1 and
repoints the pointer.

`ai_jobs` is the one genuinely mutable-status entity here (`queued → processing →
completed|failed|cancelled`), matching the `reviews.status` precedent from Phase 2C.2: a narrow,
RPC-gated column, every transition logged to `activity_events`. It's retried **in place**
(`attempts` increments, status resets to `queued`) rather than spawning a new row per attempt,
because a job's lifecycle genuinely is one thing with a history of states — there's nothing to
preserve by forking it.

### API surface

Repository layer only, no frontend database logic — same split as every previous phase:

- `src/lib/intelligence/queries.ts` — every read (transcripts + segments, comparison + findings,
  pronunciation findings, health snapshots, job status, permissions, batch summaries for the
  recordings browse page).
- `src/lib/intelligence/service.ts` — one function per RPC (`requestTranscription`,
  `requestBulkTranscription`, `cancelAiJob`, `retryAiJob`).
- `src/lib/intelligence/actions.ts` — thin `"use server"` wrappers, each firing an **unawaited**
  worker "kick" after enqueueing (see Background Jobs below) so a real, possibly slow
  transcription never blocks the request/response cycle.
- `src/lib/ai/` — the actual AI logic, deliberately separate from the database-facing
  `intelligence/` module: `elevenlabs.ts` (the real STT client), `comparison.ts` (the diff
  algorithm), `pronunciation.ts` (category heuristic), `health.ts` (aggregation), `text.ts`
  (shared normalization/similarity helpers), and `worker.ts` (the queue processor — see below).
  Every one of these is a **pure function module**: no Supabase client, no I/O beyond what's
  passed in, directly unit-testable exactly like `audio-upload/matcher.ts`.

## Transcription

`src/lib/ai/elevenlabs.ts` calls the real ElevenLabs speech-to-text API
(`POST https://api.elevenlabs.io/v1/speech-to-text`, `model_id: scribe_v1`, word-level
timestamps) — genuinely real, no mock transcription output anywhere. **Every transcript belongs
to an audio_version** (never a whole audio_item, since a replacement take genuinely is different
audio that deserves its own transcript). `request_transcription(audio_version_id)` is the single
entry point for both a first-ever transcript and a deliberate regeneration — it logs
`transcript_requested` the first time, `transcript_regenerated` on every subsequent call, and is
idempotent: a second call while one is already queued/processing returns the existing job instead
of racing a duplicate (enforced by a partial unique index,
`ai_jobs_one_live_per_target_idx`, not just application discipline).

**Bulk generation**: `request_bulk_transcription(audio_version_ids[])` — same idempotency
guarantee per item, returning one job id per version so the caller can show per-row status
immediately. `src/components/intelligence/bulk-transcription-queue.tsx` is the recordings
browse-page UI: select recordings (checkboxes appear only for roles that
`can_generate_ai_work`), one "Generate N transcripts" action.

## Background jobs

**No external queue service exists in this stack** (no Redis, no BullMQ, no Inngest) — "move AI
work off request threads" is implemented as a Postgres-backed durable queue plus an in-process
poller, the same "build the mechanism out of what Postgres + Node already give us" approach
`docs/audio-foundation.md` used for bounded-concurrency bulk upload:

- **Claim**: `claim_next_ai_jobs(job_type, limit)` is a single `UPDATE ... FOR UPDATE SKIP LOCKED
  ... RETURNING *` — atomic, safe for more than one worker tick to run concurrently without
  double-processing the same job.
- **Execute**: `src/lib/ai/worker.ts`'s `processQueuedJobs(client, limit)` claims up to `limit`
  jobs of each type (transcription, then comparison, then health) and runs each to completion or
  failure — every per-job error is caught and recorded via `fail_ai_job`, so one bad job never
  aborts the pass.
- **Idempotent execution**: re-running a completed job's effects never happens, because
  `processQueuedJobs` only ever claims `queued` rows — a `completed`/`failed`/`cancelled` job is
  never touched again.
- **Retries**: `fail_ai_job` auto-requeues up to `max_attempts` (default 3), then marks the job
  permanently `failed` and logs it to `activity_events`. A person can additionally trigger
  `retry_ai_job` on any failed job — this resets `attempts` to 0 (a deliberate human retry is a
  fresh budget, not a continuation of the automatic count).
- **Failure logging**: every terminal failure's exact error message is stored on `ai_jobs.
  last_error` and surfaced in the UI (`AiJobStatus` component) — never swallowed.
- **Chaining**: on success, `processTranscriptionJob` enqueues a `comparison` job for the same
  audio_version (best-effort — an "already live" conflict is exactly the idempotency guarantee
  working, not an error); `processComparisonJob` does the same for `health`. Comparison/health
  fail with a clear, real message (`"no approved script revision exists yet"`, `"no completed
  transcript is available yet"`) rather than silently skipping when their prerequisites aren't
  met yet — retrying later, once they are, just works.
- **Recovery**: `src/instrumentation.ts` starts `processQueuedJobs` on an interval (every 5s)
  the moment the Next.js server boots, using the service-role client (a background tick has no
  signed-in user to run as). If the server restarts mid-job, a `processing` row simply sits until
  a person retries it — see Known Limitations for why there's no automatic staleness detection
  yet.

**Testability**: `processQueuedJobs` is a plain, awaitable function — tests call it directly
(`supabase/tests/intelligence-engine.test.mjs`) for deterministic, timer-free assertions, rather
than needing to wait on real interval ticks.

## Comparison engine

`src/lib/ai/comparison.ts`'s `compareScriptToTranscript(scriptLines, transcriptSegments)` — pure,
no I/O. "Do not rely on string equality. Use semantic alignment while preserving exact
differences" is implemented as a **Levenshtein-weighted Needleman-Wunsch sequence alignment**:
two words align as a match/substitution pair whenever they're *similar enough* (normalized,
fuzzy-matched), not only when byte-identical, so a single misheard word never cascades into
"everything after this point looks completely different." Every aligned pair still carries both
its exact script text and exact transcript text — nothing is lossy.

Consecutive words sharing the same classification are merged into one phrase-level finding (so
three consecutive extra words become one `additional_phrase`, not three). Classifications:

| Classification | Meaning |
|---|---|
| `perfect` | Aligned, identical after normalization |
| `minor_wording` | Aligned, high similarity (typo-scale difference) |
| `major_wording` | Aligned, low similarity (a genuinely different word) |
| `missing_phrase` | In the script, absent from the transcript |
| `additional_phrase` | In the transcript, absent from the script (includes repeated wording) |
| `possible_pronunciation` | Aligned, but the script word looks like a name AND transcript confidence is shaky |
| `timing_issue` | A script line's spoken pace deviates sharply from the recording's own average |
| `confidence_issue` | Very low transcript confidence, regardless of wording match |

**Order changes** (a transposition) aren't given a dedicated classification — the alignment
represents a reordering as a `missing_phrase` + `additional_phrase` pair for the same words,
which still correctly draws a reviewer's attention to it (see Known Limitations).

**Storage discipline**: comparison is only ever regenerated when explicitly requested (a
transcript regenerates, or a person asks again) — `comparison_results` is never silently
recomputed on every page load. `match_ratio` (share of script words that aligned as match/
substitute, regardless of classification) is stored alongside the full findings for an
at-a-glance number plus the detail to act on.

**Standard Radio only, for now**: `comparison_results.script_revision_id` requires a real
`script_revisions` row. PRAMS recordings (compared against matrix wording, not a script revision)
aren't supported by comparison yet — the job fails with a clear, honest message rather than
fabricating a comparison against the wrong kind of data. See Known Limitations.

## Pronunciation

`src/lib/ai/pronunciation.ts` categorizes a flagged word (place / airport / destination / brand /
person / general) via a small built-in dictionary — genuinely a heuristic, not a named-entity
model. Pronunciation findings are produced **as part of the comparison job**, not a separate job
type, because they use exactly the same alignment + confidence data: a script word that looks like
a proper noun (`looksLikeProperNoun` in `src/lib/ai/text.ts` — capitalized, not a common
sentence-initial word) paired with shaky transcript confidence is flagged. **Only flag, never
assert** — an uncategorized proper noun still gets flagged, under the honest `general` category
rather than a guessed-wrong specific one.

## Recording Health

`src/lib/ai/health.ts`'s `generateHealthSnapshot` — six categories, each independently rated
Excellent/Good/Needs Review/Attention Required, then the **overall rating is the worst category**
(a health summary that hid one bad category behind a good average would defeat the point):

| Category | Real signal used |
|---|---|
| Transcript match | `comparison.matchRatio` |
| Pronunciation | Count of pronunciation findings relative to script length |
| Timing | Count of `timing_issue` findings |
| Noise detection | **`audio_versions.waveform_peaks`** — genuinely real data from Phase 2C.1, not fabricated: sustained near-1.0 peaks flag likely clipping, sustained near-0 peaks flag likely dead air |
| Confidence | Average transcript segment/word confidence |
| Completeness | Missing-word count relative to script length |

"Health summarises findings. It never replaces human judgement" — `recording_health_snapshots`
has no relationship to `approvals` or `reviews.status` whatsoever; it is purely informational,
displayed in the review sidebar (`HealthSummary`) alongside, never instead of, the human approval
state.

## Review experience

The recording page's Script section (Phase 2C.2) becomes `TranscriptPanel`
(`src/components/intelligence/transcript-panel.tsx`), reviewer-chosen between three modes:

- **Side by side** — script (left) and transcript (right), each line/segment's left border
  coloured by the worst finding touching it, clickable to jump.
- **Overlay** — one continuous reading view: the transcript's words, coloured inline by
  classification, missing phrases shown struck through in their script wording.
- **Diff list** — a flat, filterable list of individual findings (classification badge, timecode,
  confidence, script text vs. heard text) — "every finding should be filterable" via the same
  chips row in all three modes (All / Issues only / each classification).

**Jump to issues**: clicking any finding (in any mode, or its pin on the waveform) seeks playback
to the finding's start time, highlights that finding across every surface that shows it — the
waveform (a violet/slate pin, rendered *above* the timeline; comment pins from Phase 2C.2 render
*below*, so the two never read as the same kind of thing), the side-by-side line/segment border,
and the diff-list row. `startMs` on a finding is taken directly from the aligned transcript
word/segment, so playback genuinely starts at the right place rather than an approximation.

**Design**: no glowing robots, no sparkle icons on results — the one `Sparkles` icon in
`AiJobStatus` appears only on the idle "Generate transcript" action itself, never decorating a
finding, a health category, or a comparison result. Colour is used sparingly (slate/violet/amber,
warmer only for `missing_phrase`/`major_wording`) rather than a full red/green traffic-light
treatment on every word.

## Model versioning

`ai_model_metadata` — one row per distinct `(provider, model, model_version, prompt_version)`
tuple, de-duplicated via `ensure_ai_model_metadata`. Transcription jobs use `('elevenlabs',
'scribe_v1', null, null)`; comparison/health jobs use `('ima-signal', 'comparison-heuristic' |
'health-heuristic', 'v1', null)` — genuinely distinct from the ElevenLabs config, since they're
this codebase's own algorithm, not a third-party model call. `transcript_versions.
processing_duration_ms` and `.generated_at` complete the "provider, model, version, prompt
version, generation timestamp, processing duration, language" list from the brief. **Reprocessing
always creates a new version** — see Transcription above.

## Permissions

`can_generate_ai_work(project_id)` is the single predicate both RLS and the frontend call (via
`.rpc()`, never re-implemented in TypeScript) — identical set to Phase 2C.1's
`can_upload_audio_for_project`:

| Role | Generate transcripts | View results |
|---|---|---|
| IMA Admin / Producer | ✅ | ✅ |
| Studio Admin / Contributor | ✅ (own project only) | ✅ |
| Jet2 Reviewer | ❌ | ✅ |
| IMA Reviewer | ❌ | ✅ |
| Jet2 View-only | ❌ | ✅ (playback only, per Phase 2C.2) |

The real permission check happens at exactly one moment: the `ai_jobs` INSERT
(`ai_jobs_insert_generators` policy). Everything after that — the worker's writes to
`transcripts`, `transcript_versions`, `comparison_results`, etc. — runs as `service_role` and
bypasses RLS entirely, the same way a background job processor in any real system runs on behalf
of the system, not a specific user's browser session. `authenticated` has **no INSERT grant** on
any AI result table — only `service_role` (the worker) can ever write one.

## Activity

Every transition logs to the same `activity_events` table Phase 2A/2B/2C.1/2C.2 already use:
`transcript_requested`, `transcript_completed`, `transcript_failed`, `transcript_regenerated`,
`comparison_generated`, `comparison_failed`, `health_generated`, `health_failed`,
`ai_job_cancelled`, `ai_job_retried` — all newest-first in the recording page's unified timeline,
proven end-to-end in `supabase/tests/intelligence-engine.test.mjs`.

## A real bug this caught

**A trigger without `SECURITY DEFINER`** — same category of bug Phase 2C.2 caught (documented in
`docs/review-engine.md`) — did **not** recur here, because every function that inserts into a
table `authenticated` has no write grant on (`ensure_transcript`, `ensure_ai_model_metadata`) was
written with `security definer set search_path = public` from the start, following that
precedent directly.

**Waveform markers with an out-of-range timecode overflowed the page horizontally.** While
building the demo data used to verify this phase's UI in a browser, a hand-authored transcript
segment carried a timecode (11.5s) beyond its 3-second test audio's real duration. The Waveform
component computed `left: 383%` for that marker's pin — an absolutely-positioned child with no
clamping — which inflated the page's scrollable width far past the viewport instead of simply
rendering off to the side invisibly. Fixed by clamping every marker's position ratio to `[0, 1]`
in `src/components/audio/waveform.tsx` (`clampRatio`), applied to both the Phase 2C.2 comment
markers and this phase's finding markers. A stale/mismatched timecode is a real possibility in
production (an AI finding computed against a slightly different pass, or a comment left before a
shorter replacement take) — this makes it render harmlessly at the timeline's edge instead of
breaking the page layout.

## Known limitations

**No ElevenLabs API key is configured in this development sandbox.** `ELEVENLABS_API_KEY` is
unset, so every real transcription job genuinely fails with `ElevenLabsNotConfiguredError` —
this is an honest failure, not fabricated success, and is exactly what
`supabase/tests/intelligence-engine.test.mjs`'s queue/retry/failure-recovery assertions exercise.
Comparison and health generation need no external API at all (pure algorithm over transcript
text), so those are tested against a test-authored transcript inserted via the same
`record_transcript_result` RPC a real completed job would call — the same "synthetic content,
real pipeline" approach `audio-upload.test.mjs` already uses with tiny fixture tones standing in
for real recordings. Once a real key is set, `src/lib/ai/elevenlabs.ts` needs no code changes.

**Comparison supports Standard Radio only.** PRAMS recordings are compared against matrix
wording, not a script revision — this phase's `comparison_results.script_revision_id` requires
the latter. A PRAMS comparison job fails with a clear message rather than silently no-op'ing;
extending comparison to PRAMS wording groups is future work.

**No dedicated "reorder" detection.** A transposition (the same words, moved) surfaces as a
`missing_phrase` + `additional_phrase` pair rather than a single "moved" classification — still
correctly flags the section, just not labelled as a move specifically.

**Pronunciation categorization is a small hand-maintained dictionary**, not a real named-entity
model — it never emits `person_name` (no reliable signal for personal names without a real
gazetteer), and uncategorized proper nouns fall back to the honest `general` category rather than
a guessed-wrong specific one.

**No automatic stale-job recovery.** `ai_jobs.claimed_at` is recorded specifically to support
detecting a `processing` job whose worker crashed mid-flight, but nothing yet automatically
re-queues a job stuck in `processing` past some staleness window — a person must notice and
retry it. A cron-style sweep (`UPDATE ai_jobs SET status = 'failed' WHERE status = 'processing'
AND claimed_at < now() - interval '10 minutes'`) is natural, small follow-up work.

**The worker polls on a fixed 5-second interval**, not a push/notify mechanism — `LISTEN`/
`NOTIFY` or a real queue's blocking pop would reduce latency further, but a 5-second worst-case
delay (plus the unawaited "kick" fired right after enqueue, which makes the common case near-
instant) is more than adequate for a review workflow, not a real-time system.

**No notifications, email workflows, external integrations, or reporting** — explicitly out of
scope for this phase per the brief; those are Phase 3.
