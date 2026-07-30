# IMA Signal — Phase 2 Technical Implementation Plan

Status: **planning only — no implementation yet.** This document defines the backend
architecture for the frontend and information architecture approved in Phase 1 / 1.5
(mock-data prototype, branch `claude/ima-signal-setup-3wswin`). It covers Supabase schema,
storage, background processing, transcription, permissions, and the specific hard problems
raised by PRAMS. It intentionally contains no application code — schema sketches are given
as annotated field lists, not DDL, so they can be debated before being turned into migrations.

Everything here is designed to make real what the prototype already assumes:

- Two project types — `standard_radio` and `prams` — sharing one reviewable-item model.
- A PRAMS project is one update (e.g. "PRAMS — July 2026 Update"), containing many
  announcement sections, each containing many announcement variants, each an independently
  reviewable item (audio, transcript, QC, comments, change requests, approval, activity) —
  exactly like a Standard Radio script variant.
- The Boarding matrix's shared/specific/blank wording model, and its editing-safety rules,
  need to survive contact with a real database and a real workbook re-import.

---

## 1. Core entities and relationships

### 1.1 Entity list

| Entity | Summary |
|---|---|
| Organisation | IMA, Jet2, one or more studios |
| User profile | A person, scoped to one organisation, with a role |
| Campaign | Marketing grouping above a Standard Radio project (unchanged from today) |
| **Project** | Either a Standard Radio campaign or a PRAMS update. `type` discriminates. |
| Script | A reviewable item *definition*: title, variant/reference code, versions. For PRAMS, this is an announcement variant. |
| Script version | One authored draft of a script's body text |
| PRAMS section | A phase within one PRAMS project (Boarding, Safety Demonstration, …) |
| PRAMS line | One spoken-line position within a section (a matrix row) |
| PRAMS wording group | One authored cell (or merged-cell range) of wording for a line |
| PRAMS wording group variant | Join row: which script(s)/variant(s) a wording group applies to |
| Audio item | The audio "slot" for one script (1:1 with script) |
| Audio version | One uploaded/recorded take, with transcript + QC once processed |
| QC result / QC difference | Script-vs-transcript comparison output |
| Review comment / reply | Timecoded or general feedback on an audio version |
| Change request | A structured ask for a specific re-record, with priority/assignment |
| Approval | One reviewer's decision on an audio version (append-only log) |
| Activity event | Append-only audit trail of everything that happened |
| Workbook import | One PRAMS workbook upload event, with its detected diff |
| Audio import batch / file | One bulk-audio-upload event and its per-file match result |
| Notification | One user-facing alert, generated from an event |
| Processing job | One background task (transcription, QC, notification, import) |

### 1.2 Why PRAMS variants reuse the Script/AudioItem shape

The frontend already made this call, and Phase 2 should keep it: a PRAMS announcement
variant (e.g. `081A.J2 - BOARDING & FUEL – VIP`) is stored as a `scripts` row (extended with
nullable PRAMS columns) plus one `audio_items` row, identical in shape to a Standard Radio
script variant. The payoff is real, not cosmetic:

- `audio_versions`, `review_comments`, `change_requests`, `approvals`, and `activity_events`
  need **zero** schema changes to support PRAMS — they already anchor on `audio_version_id` /
  `script_version_id`, which exist for both project types.
- The transcription/QC pipeline, comment threads, change-request workflow, and approval
  workflow are built once and used by both project types.
- Search/filter/pagination across 100+ variants is just "list scripts for this project",
  the same query Standard Radio's variant list already uses.

The cost is that `scripts` carries a handful of columns that are `NULL` for Standard Radio
rows (`reference_code`, `full_reference`, `tags`, `prams_section_id`). That's an acceptable
trade for not maintaining a second, parallel review pipeline.

---

## 2. Standard Radio hierarchy (unchanged shape, now real)

```
organisation
  └─ campaign
       └─ project (type = standard_radio)
            └─ script (one per route/variant)
                 ├─ script_version (many, one "approved for recording")
                 └─ audio_item (one)
                      └─ audio_version (many)
                           ├─ qc_result → qc_difference (many)
                           ├─ review_comment (many) → comment_reply (many)
                           ├─ change_request (many)
                           └─ approval (many, append-only decision log)
```

No structural change from the prototype. What Phase 2 adds is: real auth, real storage,
real transcription, and real persistence for everything currently held in React state.

---

## 3. PRAMS project hierarchy

```
organisation (jet2)
  └─ project (type = prams)               "PRAMS — July 2026 Update"
       └─ prams_section (many)            "Boarding", "Safety Demonstration", …
            ├─ prams_line (many, ordered) one spoken-line position
            │    └─ prams_wording_group (1 or more per line)
            │         └─ prams_wording_group_variant (join → script)
            └─ script (many)              one per announcement variant, e.g. "081A.J2 - …"
                 ├─ script_version         current approved wording (see §4.5)
                 └─ audio_item → audio_version → … (identical to Standard Radio, §2)
```

A **PRAMS project = one update** (July 2026, August 2026, …). Sections, lines, wording
groups and variants are all scoped to that one project row. This is a deliberate MVP
simplification — see §17 (Risks) for the alternative (a global, cross-update section/variant
registry) and why it's deferred.

### 3.1 `prams_sections`

One row per section per project. `slug` (e.g. `boarding`) is stable across updates so a
future update's Boarding section can be compared to this one (§10.10) even though it's a
different row. `available` mirrors the prototype's honesty rule: `false` means "not yet
transcribed from the source workbook", and the UI must never fabricate wording for it.

### 3.2 `prams_lines`

One row per spoken-line position within a section, with an explicit `sort_order`. This is
the "script lines and authored ordering" requirement — order is a stored, authored fact, not
inferred from anything else (not from `created_at`, not from reference codes).

### 3.3 `scripts` (PRAMS variant columns)

For a PRAMS row: `reference_code` (`"080.J2"`), `full_reference` (`"080.J2 - BOARDING"`),
`tags` (jsonb array, e.g. `["VIP"]` — searchable attributes only, never a substitute for
`full_reference` in the UI, per the approved matrix design), `prams_section_id`,
`column_order` (position among that section's variant columns), `is_active` (false once
retired by a later workbook import — see §9.3).

---

## 4. The PRAMS wording model — shared wording, blanks, and overrides

This is the part of the schema that has to get the ten difficult cases (§10) right. The
model is a direct, durable translation of the frontend's `PramsCellGroup` design: **sharing
is an explicit, authored fact, never inferred from matching text.**

### 4.1 `prams_wording_groups`

One row = one authored cell or merged-cell range for one line. `text` (nullable — `NULL`
means intentionally blank, per the source workbook). `is_current` (boolean) and
`superseded_by_group_id` give every edit a permanent, queryable history instead of an
in-place mutation.

### 4.2 `prams_wording_group_variants`

The join table that *defines* sharing: `(wording_group_id, script_id, column_position)`.
Two variants share wording **if and only if** they appear under the same
`wording_group_id` — never because their `text` happens to match. This single design
choice is what makes cases 1 and 2 (§10) both correct at once.

`column_position` must be contiguous within a line for a given group (enforced at the
application layer during import/edit, not just assumed) — a merged cell in the source
spreadsheet is always a contiguous run of columns, and every split/merge operation in
this schema must preserve that invariant.

### 4.3 `prams_wording_edit_history`

Append-only. One row per edit action: `wording_group_id` (before), `action`
(`update_shared` | `create_override` | `remerge`), `affected_script_ids` (jsonb array,
captured at the time of the edit — the impact-confirmation the UI already shows, made
durable), `previous_text`, `new_text`, `actor_user_id`, `created_at`. This is the audit
trail for exactly the kind of change the approved UI already gates behind a confirmation
dialog — the dialog's content *is* this table's row, written at commit time.

### 4.4 Blank vs. not-yet-imported

A line/variant combination can be in exactly one of three states, and the schema must keep
them distinguishable:

1. **No `prams_wording_group_variants` row exists** for that (line, script) pair → not yet
   imported / this section hasn't been transcribed yet (prototype-only state today).
2. **A row exists, and its group's `text` is `NULL`** → confirmed intentional blank, taken
   directly from the workbook. Never auto-filled, never flagged as an error (per the
   approved matrix design).
3. **A row exists with non-null `text`** → real, authored wording.

### 4.5 What "the approved script" for a variant actually is

A PRAMS variant's `script_versions.body` (used everywhere else in the review pipeline —
"Approved script", QC comparison, etc.) is **derived**, not independently authored: it is
the ordered concatenation of that variant's current `prams_wording_groups.text` across all
of that section's `prams_lines`, skipping blanks. This must be recomputed (and a new
`script_versions` row written) whenever any wording group touching that variant changes —
see §10.4–§10.6. This mirrors exactly how the prototype's mock data was generated from
`BOARDING_PHASE`.

---

## 5. The shared reviewable-item pipeline

Identical for both project types (§1.2). Summarised here; see §19 for exact fields.

- **Audio items / versions** — one `audio_items` row per script, many `audio_versions`
  (take 1, take 2, …). Each version carries its own status, approval flag, and processing
  state.
- **Transcript** — stored as a `transcript` jsonb column on `audio_versions` (word, `start_ms`,
  `end_ms`, `confidence`), not a normalized word table. MVP has no query that needs
  word-level SQL access across versions (transcripts are always read whole, for one version,
  by the UI); a normalized `transcript_words` table is listed as a later enhancement (§25)
  if cross-version/cross-project word-level analytics become a real requirement.
- **QC** — `qc_results` (one per audio version, `match_percentage`) + `qc_differences`
  (many, `severity`/`type`/`expected_text`/`actual_text`/timecodes) — kept relational
  because the UI filters by severity constantly (`DifferencesList`).
- **Comments** — `review_comments` (`start_ms`/`end_ms` nullable — null means a general,
  non-timecoded comment, exactly as today) + `comment_replies`.
- **Change requests** — structured, prioritised, assigned to an organisation, with a
  resolution trail (`resolved_in_version_id`).
- **Approvals** — append-only decision log (§5.1) plus a denormalized "current state" on
  `audio_versions` for fast list rendering.
- **Activity** — one `activity_events` row per meaningful mutation across the whole system
  (project created, script approved, audio uploaded, comment added, change request
  created/resolved, status changed, approval decided, import completed, …).

### 5.1 Approval: state vs. history

Two things, not one:

- `audio_versions.status` / `is_approved` / `approved_by_user_id` / `approved_at` —
  denormalized **current state**, fast to read in list views (project rows, section
  navigator, dashboard).
- `approvals` — **append-only history** of every decision ever made on that version
  (`decision`, `reviewer_user_id`, `reviewer_organisation_id`, `comment`, `decided_at`).
  The denormalized state on `audio_versions` is a materialized view of "the latest row in
  `approvals` for this version", kept in sync transactionally whenever a decision is
  written (application-layer transaction, not a database trigger, to keep business rules —
  who's allowed to decide at which stage — in one reviewable place).

---

## 6. Workbook imports & bulk audio imports

### 6.1 Workbook import

`prams_workbook_imports`: one row per import attempt (`project_id`, `file_storage_path`,
`file_hash`, `imported_by`, `status`, `started_at`, `completed_at`). The import is
**diff-based**, never a wholesale replace (§10.7 has the full worked example):

1. Parse the workbook into the same shape as today's Python extraction (sections → lines →
   authored cell groups, with merges taken from the sheet's real merged-cell ranges, never
   inferred from text).
2. Diff against the project's current `prams_wording_groups` / `prams_wording_group_variants`
   / `scripts` (PRAMS columns), producing a `prams_workbook_import_diffs` row per detected
   change: `new_variant`, `retired_variant`, `wording_changed`, `merge_changed`, `unchanged`.
3. **Show the diff to the user before applying it** (mirrors the matrix's existing
   edit-impact-confirmation pattern) — this is a review-and-confirm step, not a background
   job with no human in the loop.
4. On confirm, apply changes transactionally per §9.3: never delete a `scripts` row, never
   touch `audio_versions`/`review_comments`/`change_requests`/`approvals`.

### 6.2 Bulk audio upload

`audio_import_batches` (one per bulk-upload session) → `audio_import_files` (one per
uploaded file: `original_filename`, `file_hash`, `match_status` [`matched` | `unmatched` |
`duplicate`], `matched_script_id`, `resolved_audio_version_id`). Matching logic (server-side
version of the prototype's client-side matcher, §10.8):

1. Normalize filename (strip non-alphanumerics, uppercase).
2. Extract a candidate reference-code token via regex (`\d{2,3}[A-Z]?\.?J2`-shaped).
3. Exact-match the token against `scripts.reference_code` for this project (indexed).
4. No exact match → substring fallback against normalized `reference_code`; still no match
   → `unmatched`, held for manual assignment in the review step.
5. Second file matching an already-matched code in the same batch → `duplicate`, held for
   manual resolution (keep-first / keep-latest / explicitly-both-as-new-versions).
6. Nothing is written to `audio_versions` until the user confirms the import summary —
   exactly the flow already prototyped in `PramsImportWorkflow`.

---

## 7. Users, roles and permissions

Unchanged role model from the prototype (`OrgRole`), now backed by Supabase Auth:

| Role | Can do |
|---|---|
| `ima_admin` | Everything: create projects (either type), manage users, all of the below |
| `ima_producer` | Create/edit scripts & PRAMS wording, upload audio, comment, decide at the IMA review stage, request changes to studio |
| `ima_reviewer` | Comment, decide at the IMA review stage |
| `jet2_reviewer` | Comment, decide at the Jet2 (client) review stage — the final sign-off |
| `jet2_view_only` | Read-only across everything Jet2 can see |
| `studio_admin` / `studio_contributor` | Upload audio versions for scripts belonging to their own `studio_organisation_id`; respond to change requests; **cannot** approve; **cannot** see other studios' projects |

IMA vs. Jet2 review is the same two-stage pipeline already encoded in `AudioVersionStatus`
(`ready_for_ima_review → ima_changes_requested → ready_for_jet2_review →
jet2_changes_requested → approved`) — unchanged for PRAMS, since PRAMS variants share the
same status enum.

**Split of responsibility:** Postgres RLS enforces *tenant/organisation isolation* (which
rows a role can see or write to at all). *Workflow rules* (only a Jet2 reviewer may record a
decision while a version is `ready_for_jet2_review`) are enforced in the application/edge
function layer, with RLS as a defense-in-depth backstop, not the primary mechanism — RLS
predicates get unreadable fast if they try to encode a whole state machine.

---

## 8. Notifications

`notifications` (`user_id`, `type`, `payload` jsonb, `read_at`, `created_at`), generated by
the same application-layer code path that writes `activity_events` (one write, two rows —
keeps them from drifting apart). MVP triggers: new comment, new change request, status
change, approval decision, workbook import completed. MVP delivery: in-app feed only, backed
by Supabase Realtime on `notifications` inserts. Email/digest is a later enhancement (§25) —
`projects.notification_email` already exists in the schema for when it's built.

---

## 9. Auditability, deletion, and retention

### 9.1 Auditability

Nothing that matters is ever hard-deleted or mutated in place:

- `activity_events` — append-only, one row per meaningful action, system-wide.
- `approvals` — append-only decision log (§5.1).
- `prams_wording_edit_history` — append-only wording-change log (§4.3).
- `script_versions` / `prams_wording_groups` — new row per change, old rows kept with
  `is_current = false`, never overwritten.

### 9.2 Deletion & retention

Soft-delete only: `deleted_at` on `projects`, `scripts`, `audio_versions`. Nothing is
purged automatically. Storage objects (raw audio, workbooks) follow the same rule —
superseded audio versions are retained, not removed, unless a retention job is explicitly
run. **Open question, not yet answered:** how long Jet2's contract requires audio/workbook
retention, and whether superseded (non-final) audio versions can ever be purged to save
storage cost. This needs a legal/commercial answer before any deletion job is built — see
§17.

### 9.3 Non-destructive workbook re-import (ties §6.1 and §9.1 together)

The rule that makes re-import safe: **a workbook import only ever touches
`prams_sections` / `prams_lines` / `prams_wording_groups` / `prams_wording_group_variants`
and the PRAMS-specific columns on `scripts`.** It never writes to `audio_items`,
`audio_versions`, `review_comments`, `change_requests`, `approvals`, or
`activity_events`. A variant's reviewable-item history is anchored to its `scripts.id`,
which is stable across re-imports as long as its `reference_code` persists; if a
reference_code disappears from a new workbook, the row is marked `is_active = false`
(never deleted), so every comment, audio file, and approval decision made against it stays
queryable forever.

---

## 10. Storage layout

Supabase Storage, private buckets only (no public bucket, ever — access via short-TTL
signed URLs):

| Bucket | Path convention | Contents |
|---|---|---|
| `audio-originals` | `{project_id}/{script_id}/{audio_version_id}/{filename}` | Raw uploaded/recorded files, untouched |
| `audio-playback` | `{project_id}/{script_id}/{audio_version_id}/playback.mp3` | Normalized/transcoded copy the player actually streams |
| `workbooks` | `{project_id}/imports/{import_id}/{filename}` | Uploaded PRAMS `.xlsx` files |

`audio_versions.storage_path` and `prams_workbook_imports.file_storage_path` store the path;
the API mints a signed URL on demand rather than persisting one (URLs expire).

---

## 11. Row-level security approach

RLS **enabled on every table**. A `SECURITY DEFINER` helper, `can_access_project(project_id
uuid)`, centralizes the tenant-isolation predicate so it isn't copy-pasted (and drifted)
across 20+ table policies:

```
can_access_project(project_id):
  organisation_type(current_user) IN ('ima', 'jet2')
  OR (organisation_type(current_user) = 'studio'
      AND organisation_id(current_user) = projects.studio_organisation_id)
```

Every table that hangs off `projects` (directly or via `scripts`/`audio_items`) gets a
policy of the shape `USING (can_access_project(project_id))` for `SELECT`, with narrower
`WITH CHECK` clauses on `INSERT`/`UPDATE` for the studio-upload-only and
review-stage-ownership rules described in §7. `jet2_view_only` gets `SELECT`-only policies
across the board (no `INSERT`/`UPDATE`/`DELETE` grants regardless of RLS).

---

## 12. Background processing approach

A single `processing_jobs` table (`type`, `payload` jsonb, `status`
[`pending`|`processing`|`succeeded`|`failed`|`dead_letter`], `attempts`, `max_attempts`,
`run_at`, `last_error`) is enough at this scale — no external queue (SQS/Kafka) is justified
for "100+ variants per update, a handful of updates a year". Supabase's `pg_cron` polls for
due jobs on a short interval and invokes an Edge Function per job `type`:

- `transcribe_audio` — calls ElevenLabs (§13)
- `compute_qc` — diffs transcript vs. approved script
- `send_notification` — fans a `notifications` row out to email/realtime
- `process_workbook_import` — the diff step in §6.1
- `match_audio_batch` — the matching step in §6.2

Each job type has a natural idempotency key enforced as a unique constraint (§14), so a
duplicate enqueue (retry, double-click, webhook replay) is a no-op, not a double-process.

---

## 13. ElevenLabs transcription flow

```
audio_version uploaded (storage write completes)
  → INSERT audio_versions row, status = 'uploaded'
  → enqueue processing_jobs('transcribe_audio', {audio_version_id})
  → Edge Function: fetch signed URL for the original file, call ElevenLabs
    Speech-to-Text, receive word-level {word, start_ms, end_ms, confidence}
  → UPDATE audio_versions SET transcript = ..., transcription_status = 'ready_for_review',
    overall_confidence = ...
  → enqueue processing_jobs('compute_qc', {audio_version_id})
  → Edge Function: align transcript against the version's script_version.body
    (word-level diff/alignment — algorithm choice is a spike, see §17), classify each
    difference by DifferenceType/DifferenceSeverity
  → INSERT qc_results, qc_differences
  → UPDATE audio_versions SET status = 'ready_for_ima_review'
  → activity_event + notification
```

Both project types run the identical pipeline — a PRAMS variant's `script_version.body` is
just derived differently (§4.5), not compared differently.

---

## 14. Retry and failure handling

`processing_jobs.attempts` increments on every failure; `run_at` is rescheduled with
exponential backoff (e.g. 1m, 5m, 20m) up to `max_attempts` (default 3), after which the job
moves to `dead_letter` and `audio_versions.transcription_status = 'failed'` — the UI already
has a `failed` state and a retry affordance; retrying re-enqueues the job with `attempts`
reset. `dead_letter` jobs are visible to IMA admins (an ops view, not user-facing) so a
systemic ElevenLabs outage is obvious rather than silently stuck.

---

## 15. Idempotency

- **Uploads**: client generates an idempotency key (UUID) per upload attempt; `audio_versions`
  has a unique constraint on `(audio_item_id, idempotency_key)` so a network retry can't
  create a duplicate version. A separate `file_hash` column additionally lets the UI warn
  "this exact file already exists as V2" without blocking an intentional re-upload.
- **Jobs**: unique constraint on `(type, payload->>'audio_version_id')` (or the equivalent
  natural key per job type) means re-enqueuing an already-pending/processing job for the
  same target is a no-op.
- **Workbook import matching / audio batch matching**: re-running either against the same
  input is safe by construction — both are read-then-diff operations that only write on
  explicit user confirmation, and confirmation is itself keyed to one `import_id` /
  `batch_id`, not re-appliable twice by design (the confirm endpoint checks
  `status != 'completed'` first).

---

## 16. Scalability for 100+ variants and multiple versions

- Every hot list query is indexed: `scripts(project_id, prams_section_id)`,
  `scripts(project_id, reference_code)` (unique per project, used by matching and
  comparison), `audio_items(script_id)`, `audio_versions(audio_item_id, version_number)`,
  `review_comments(audio_version_id)`, `change_requests(audio_version_id)`,
  `activity_events(project_id, created_at desc)`.
- The PRAMS project overview's aggregate counts (approved / awaiting review / changes
  requested / missing audio, per section and project-wide) are backed by a Postgres
  **view** first (`prams_variant_status`, computing each variant's status the same way
  the prototype's `getPramsOverviewStats` does), not recomputed ad hoc in application code.
  Only materialize it (refresh via trigger or on a schedule) if the view proves too slow at
  real scale — no evidence of that yet, so it's not built speculatively.
- The all-announcements browser and section variant lists are paginated at the database
  level (`LIMIT`/`OFFSET` or keyset pagination on `reference_code`), never "fetch all,
  filter client-side" once real data replaces the mock array.
- Bulk audio upload and workbook import both process in batches (not one giant transaction)
  so a 150-file upload doesn't hold a single long-running lock.

---

## 17. The ten difficult PRAMS cases, explained explicitly

1. **One authored line shared across several contiguous variants.** One
   `prams_wording_groups` row, with multiple `prams_wording_group_variants` rows pointing at
   it (§4.1–4.2). Sharing is that join table, full stop — never inferred.

2. **Identical wording in separate cells that must not be treated as shared.** Two
   `prams_wording_groups` rows with equal `text` but each linked to only one variant in
   `prams_wording_group_variants`. Nothing in the schema ever compares `text` values to
   decide sharing, so this can't accidentally collapse into case 1 — this was the exact bug
   the frontend design round corrected (real workbook cells B5/E5), and the schema is built
   specifically so it can't regress.

3. **Intentionally blank cells.** A `prams_wording_groups` row with `text = NULL`, still
   linked via `prams_wording_group_variants` to the variant(s) it applies to (§4.4, case 2
   in that list). Distinguished from "not yet imported" by the row's mere existence.

4. **Editing shared wording.** Application-layer transaction: read the group's current
   `prams_wording_group_variants` (the exact impact set), write a
   `prams_wording_edit_history` row capturing that set and the before/after text, update
   the group's `text` (or insert a new `is_current` row and retire the old one — see §4.1),
   then recompute `script_versions.body` (§4.5) for every affected variant. The UI's
   confirmation dialog is a direct read of the impact set computed in step one.

5. **Creating a variant-specific override from shared wording.** Given group G on variants
   `[v1, v2, v3]` (in column order) and an override request for `v2`: remove `v2` from G's
   variant list; insert a new group `G2` linked only to `v2` with the new text; if the
   remaining variants (`v1`, `v3`) are no longer contiguous, split G into `G_before` (`v1`)
   and `G_after` (`v3`), each keeping G's original text. All three writes (`G` update/split,
   `G2` insert, variant-link moves) happen in one transaction, plus a
   `prams_wording_edit_history` row with `action = 'create_override'`. This is the exact
   `splitGroupForOverride` logic already implemented client-side, made durable.

6. **Re-merging an override later.** Never automatic. The user explicitly selects an
   override group and one or more contiguous neighbouring groups to merge; the API computes
   whether their current `text` actually matches as a *suggestion*, but the merge only
   happens on explicit confirmation (same impact-confirmation pattern as case 4, in
   reverse). On confirm: create one new group spanning the union of variants, mark the
   prior groups `is_current = false` with `superseded_by_group_id` pointing at it, write a
   `prams_wording_edit_history` row with `action = 'remerge'`. Never inferred from matching
   text alone — that would silently reintroduce case 2's bug.

7. **Importing a revised workbook without destroying comments, audio, or approval
   history.** §6.1 + §9.3: the import diff only ever touches PRAMS wording/structure
   tables and the PRAMS columns on `scripts`; it never writes to `audio_items`,
   `audio_versions`, `review_comments`, `change_requests`, or `approvals`. A retired
   reference is deactivated, never deleted, so its full history stays queryable.

8. **Mapping uploaded audio filenames to announcement references.** §6.2: normalize +
   regex-extract a candidate code, exact-match against `scripts.reference_code` (indexed,
   unique per project), fall back to substring match, otherwise `unmatched` for manual
   assignment in the confirm-before-apply review step — the same UX already prototyped,
   moved server-side for real files.

9. **Adding a new announcement reference to an existing PRAMS update.** Detected by the
   workbook-import diff (§6.1) as `new_variant`: insert a new `scripts` row (PRAMS columns
   populated), a new empty `audio_items` row (no versions — the variant starts in
   `missing_audio`, exactly matching the "needs attention" model already built), and new
   `prams_wording_groups`/`prams_wording_group_variants` rows for its lines. No different
   from adding it via any other import.

10. **Comparing one PRAMS release against another.** Each update is its own `projects` row
    (§3), so comparison is a join across two projects on `scripts.reference_code` (unique
    per project, §16) — for a given code, fetch each project's current wording (via §4.5)
    and variant status, and diff them. Reference codes that don't exist in both projects are
    surfaced as "added" / "retired" rather than silently skipped. This depends on
    `reference_code` staying meaningful release-over-release; if Jet2 renumbers
    announcements between updates, this degrades to fuzzy title matching with the same
    manual-confirmation pattern used for audio matching. **Not MVP** — flagged as a later
    enhancement (§25) precisely because that renumbering risk is unresolved (§18).

---

## 18. Proposed database tables

Field lists are illustrative, not exhaustive DDL. `id` = uuid PK, `created_at`/`updated_at`
timestamps omitted below where obvious. FKs use `on delete restrict` unless noted (soft
delete is the norm, per §9).

**organisations** — `type` (enum: ima/jet2/studio), `name`. *Indexes:* none beyond PK.

**user_profiles** — `auth_user_id` (FK → Supabase `auth.users`, unique), `full_name`,
`email` (unique), `avatar_initials`, `organisation_id` (FK), `role` (enum). *Indexes:*
`(organisation_id)`.

**campaigns** — `name`, `organisation_id` (FK). *Indexes:* `(organisation_id)`.

**projects** — `type` (enum: standard_radio/prams, not null), `campaign_id` (FK), `name`,
`job_number` (unique), `description`, `status` (enum), `owner_user_id` (FK),
`studio_organisation_id` (FK), `recording_deadline`, `internal_review_deadline`,
`client_review_deadline`, `live_date`, `notification_email`, `deleted_at`. *Constraints:*
`job_number` unique. *Indexes:* `(campaign_id)`, `(studio_organisation_id)`, `(type)`.

**project_jet2_reviewers** — join table (`project_id`, `user_id`) replacing the prototype's
`jet2ReviewerUserIds` array with a real many-to-many. *Indexes:* `(project_id)`,
`(user_id)`.

**scripts** — `project_id` (FK), `title`, `variant_code`, `destination` (nullable),
`departure_airport` (nullable), `reference_code` (nullable), `full_reference` (nullable),
`tags` (jsonb, default `[]`), `prams_section_id` (FK, nullable), `column_order` (int,
nullable), `is_active` (bool, default true), `deleted_at`. *Constraints:* unique
`(project_id, reference_code)` where `reference_code is not null`. *Indexes:*
`(project_id, prams_section_id)`, `(project_id, reference_code)`.

**script_versions** — `script_id` (FK), `version_number`, `body`,
`is_approved_for_recording`, `approved_by_user_id`, `approved_at`, `created_by_user_id`,
`notes`. *Constraints:* unique `(script_id, version_number)`. *Indexes:* `(script_id)`.

**prams_sections** — `project_id` (FK), `slug`, `name`, `sort_order`, `available` (bool),
`source_sheet_name`. *Constraints:* unique `(project_id, slug)`. *Indexes:* `(project_id)`.

**prams_lines** — `section_id` (FK), `sort_order`. *Indexes:* `(section_id, sort_order)`.

**prams_wording_groups** — `line_id` (FK), `text` (nullable), `is_current` (bool, default
true), `superseded_by_group_id` (FK → self, nullable), `created_by_user_id`, `source`
(enum: workbook_import/manual_edit/override/remerge). *Indexes:* `(line_id, is_current)`.

**prams_wording_group_variants** — `wording_group_id` (FK), `script_id` (FK),
`column_position`. *Constraints:* unique `(wording_group_id, script_id)`; application-layer
check that `column_position` values under one group are contiguous. *Indexes:*
`(script_id)`, `(wording_group_id)`.

**prams_wording_edit_history** — `wording_group_id` (FK), `action` (enum),
`affected_script_ids` (jsonb), `previous_text`, `new_text`, `actor_user_id`, `created_at`.
*Indexes:* `(wording_group_id)`, `(created_at)`.

**audio_items** — `script_id` (FK, unique — 1:1). *Indexes:* `(script_id)`.

**audio_versions** — `audio_item_id` (FK), `version_number`, `script_version_id` (FK),
`status` (enum), `is_approved`, `approved_by_user_id`, `approved_at`, `uploaded_by_user_id`,
`duration_seconds`, `file_name`, `storage_path`, `file_hash`, `idempotency_key`,
`transcription_status` (enum), `overall_confidence`, `transcript` (jsonb, nullable), `notes`.
*Constraints:* unique `(audio_item_id, version_number)`; unique `(audio_item_id,
idempotency_key)`. *Indexes:* `(audio_item_id)`, `(status)`, `(file_hash)`.

**qc_results** — `audio_version_id` (FK, unique), `match_percentage`, `computed_at`,
`engine_version`. *Indexes:* `(audio_version_id)`.

**qc_differences** — `qc_result_id` (FK), `type` (enum), `severity` (enum),
`expected_text`, `actual_text`, `start_ms`, `end_ms`, `script_section_ref`, `confidence`.
*Indexes:* `(qc_result_id, severity)`.

**review_comments** — `project_id` (FK), `audio_version_id` (FK), `script_version_id` (FK),
`selected_text` (nullable), `start_ms`/`end_ms` (nullable), `author_user_id`,
`author_organisation_id`, `category` (enum), `body`, `status` (enum), `edited_at`.
*Indexes:* `(audio_version_id)`, `(project_id, status)`.

**comment_replies** — `comment_id` (FK), `author_user_id`, `body`. *Indexes:*
`(comment_id)`.

**change_requests** — `project_id` (FK), `audio_version_id` (FK), `script_version_id` (FK),
`selected_text`, `requested_replacement`, `note`, `category` (enum), `priority` (enum),
`assigned_organisation_id` (FK), `assignee_user_id`, `due_date`, `status` (enum),
`reviewer_user_id`, `resolved_at`, `resolution_note`, `resolved_in_version_id` (FK →
audio_versions). *Indexes:* `(audio_version_id)`, `(assigned_organisation_id, status)`.

**approvals** — `project_id` (FK), `audio_version_id` (FK), `script_version_id` (FK),
`decision` (enum), `reviewer_user_id`, `reviewer_organisation_id`, `comment`, `decided_at`.
*Indexes:* `(audio_version_id, decided_at desc)`.

**activity_events** — `actor_user_id`, `organisation_id` (FK), `project_id` (FK),
`entity_type`, `entity_label`, `action` (enum), `metadata` (jsonb, default `{}`).
*Indexes:* `(project_id, created_at desc)`.

**prams_workbook_imports** — `project_id` (FK), `file_storage_path`, `file_hash`,
`imported_by_user_id`, `status` (enum: pending_review/confirmed/discarded), `started_at`,
`completed_at`. *Indexes:* `(project_id, created_at desc)`.

**prams_workbook_import_diffs** — `import_id` (FK), `diff_type` (enum: new_variant /
retired_variant / wording_changed / merge_changed / unchanged), `script_id` (nullable FK,
null for genuinely new variants), `section_id` (FK), `line_id` (nullable FK), `payload`
(jsonb — the before/after detail shown in the review UI). *Indexes:* `(import_id)`.

**audio_import_batches** — `project_id` (FK), `uploaded_by_user_id`, `status`. *Indexes:*
`(project_id, created_at desc)`.

**audio_import_files** — `batch_id` (FK), `original_filename`, `file_hash`, `match_status`
(enum: matched/unmatched/duplicate), `matched_script_id` (nullable FK),
`resolved_audio_version_id` (nullable FK). *Indexes:* `(batch_id)`, `(matched_script_id)`.

**notifications** — `user_id` (FK), `type`, `payload` (jsonb), `read_at`. *Indexes:*
`(user_id, read_at)`.

**processing_jobs** — `type` (enum), `payload` (jsonb), `status` (enum), `attempts`,
`max_attempts`, `run_at`, `last_error`. *Constraints:* unique `(type, (payload->>'target_id'))`
per job type (idempotency, §15). *Indexes:* `(status, run_at)`.

---

## 19. Relationship diagram (text)

```
organisations 1──* user_profiles
organisations 1──* campaigns
campaigns     1──* projects
projects      1──* project_jet2_reviewers *──1 user_profiles
projects      1──* scripts
projects      1──* prams_sections            (only for type = prams)
prams_sections 1──* prams_lines
prams_sections 1──* scripts                  (prams_section_id, only for type = prams)
prams_lines    1──* prams_wording_groups
prams_wording_groups 1──* prams_wording_group_variants *──1 scripts
prams_wording_groups 1──* prams_wording_edit_history
scripts        1──* script_versions
scripts        1──1 audio_items
audio_items    1──* audio_versions
audio_versions 1──1 qc_results 1──* qc_differences
audio_versions 1──* review_comments 1──* comment_replies
audio_versions 1──* change_requests
audio_versions 1──* approvals
projects       1──* activity_events
projects       1──* prams_workbook_imports 1──* prams_workbook_import_diffs
projects       1──* audio_import_batches 1──* audio_import_files ──1 scripts (nullable)
user_profiles  1──* notifications
(processing_jobs stands alone — referenced by payload, not FK, since job targets vary by type)
```

---

## 20. Recommended implementation order

1. **Foundation** — Supabase Auth, `organisations`/`user_profiles`/`campaigns`/`projects`
   (with `type`), RLS skeleton (`can_access_project`, §11).
2. **Standard Radio core, made real** — `scripts`/`script_versions`/`audio_items`/
   `audio_versions`, manual upload to Storage (no transcription yet), comments/change
   requests/approvals wired to real persistence. Ship Standard Radio end-to-end before
   touching PRAMS complexity — it's the simpler half of the shared pipeline and de-risks it.
3. **Transcription & QC pipeline** — `processing_jobs`, ElevenLabs integration, QC diff
   engine. Both project types benefit immediately since they share the pipeline.
4. **Notifications** — in-app, backed by the activity/notification write path already
   flowing from steps 2–3.
5. **PRAMS matrix backend** — `prams_sections`/`prams_lines`/`prams_wording_groups`/
   `prams_wording_group_variants`, the edit/override endpoints (cases 4–5), read API for
   the matrix UI. Re-merge (case 6) can trail slightly behind if needed.
6. **PRAMS bulk workflows** — workbook import + diff (case 7, 9), bulk audio upload +
   matching (case 8).
7. **Scale/ops hardening** — verify indexes and the status view (§16) under a seeded
   100–200 variant dataset; retention/deletion policy once legal answers §17's open
   question; cross-release comparison (case 10) if still wanted after §17's risk holds.

## 21. Migration sequence

```
0001_core_entities            organisations, user_profiles, campaigns, projects
0002_rls_foundation           enable RLS, can_access_project(), base policies
0003_standard_radio_review    scripts, script_versions, audio_items, audio_versions
0004_storage_buckets          audio-originals, audio-playback, workbooks (bucket config)
0005_qc_and_comments          qc_results, qc_differences, review_comments, comment_replies
0006_change_requests_approvals change_requests, approvals, activity_events
0007_processing_jobs          processing_jobs + pg_cron polling setup
0008_notifications            notifications
0009_prams_structure          prams_sections, prams_lines
0010_prams_wording_model      prams_wording_groups, prams_wording_group_variants,
                               prams_wording_edit_history
0011_prams_variant_columns    alter scripts: reference_code, full_reference, tags,
                               prams_section_id, column_order, is_active
0012_workbook_imports         prams_workbook_imports, prams_workbook_import_diffs
0013_audio_import_batches     audio_import_batches, audio_import_files
0014_scale_indexes_and_views  remaining composite indexes, prams_variant_status view
```

---

## 22. Risks and unresolved decisions

- **Per-update vs. global PRAMS registry.** This plan scopes sections/lines/variants to one
  project (=one update), which is simple and matches the prototype, but makes cross-release
  comparison (case 10) dependent on `reference_code` staying stable release-over-release.
  If Jet2 confirms codes are reliably stable, this is fine as-is; if they're routinely
  renumbered, a global `announcement_definitions` registry (with per-update variants
  referencing a definition) would make comparison exact instead of fuzzy — bigger schema,
  deferred until we know which world we're in.
- **QC diff/alignment algorithm.** Needs a spike — word-level Levenshtein/alignment is the
  likely starting point, but severity classification (critical/important/minor/uncertain)
  needs real rules, not just edit distance.
- **ElevenLabs cost & throughput at update-time.** A single PRAMS update can mean 100+ files
  transcribed close together (bulk import day). Confirm ElevenLabs rate limits and cost
  before assuming the job queue can process a whole update's audio same-day; may need
  explicit batching/throttling in `processing_jobs`.
- **Retention/deletion policy.** Genuinely unresolved — needs a legal/commercial answer from
  Jet2 before any automated deletion job is built (§9.2). Nothing is deleted until this is
  answered.
- **Multi-studio future-proofing.** Schema and RLS already assume more than one
  `studio_organisation_id` is possible, but this is untested since today there's exactly
  one studio. Worth a deliberate test pass before a second studio is onboarded.
- **Re-merge suggestion quality.** Suggesting "these look mergeable" (case 6) risks nudging
  users toward the exact text-equality trap case 2 exists to prevent. MVP should probably
  ship *without* the suggestion (require fully manual selection) and add it only once the
  UX for making the risk clear has been validated.
- **Business-rule enforcement layer.** §7 splits RLS (tenant isolation) from
  application-layer workflow rules (who can approve what, when). That application layer
  doesn't exist yet — needs to be Edge Functions or a thin API layer, not assumed to be
  "the frontend will just not show the button" (that's not enforcement).

## 23. Test strategy

- **Unit** — wording-group split/override/re-merge logic (pure functions, directly ported
  from the frontend's already-tested `splitGroupForOverride`), filename normalization/
  matching, QC diff/alignment, idempotency-key handling.
- **Integration** — RLS policy matrix (every role × every table × SELECT/INSERT/UPDATE,
  asserting exactly the access grants in §7/§11); workbook-import diffing against fixture
  workbooks covering every case in §17 (new variant, retired variant, blank cell, merge
  changed, identical-but-separate cells); job retry/backoff behaviour under simulated
  ElevenLabs failures.
- **Contract** — ElevenLabs adapter tested against a mocked API, so pipeline logic isn't
  coupled to a live third-party call in CI.
- **End-to-end** — extend the Playwright flows already used to verify the prototype
  (per-round in this project's history) to run against a seeded staging Supabase project
  instead of mock data, covering the same screens already verified visually in Phase 1.5.
- **Load/scale** — seed 300–500 PRAMS variants across several sections and confirm the
  overview, section navigator, and all-announcements browser stay responsive under
  pagination (§16) before calling PRAMS "production ready" at real scale.

## 24. Explicitly out of scope for this document

No application code, no actual Supabase project, no migrations run, no ElevenLabs account
wired up. This is the plan to review before any of that starts.

## 25. MVP vs. later enhancements

**MVP (Phase 2 initial release):**
- Real auth, organisations, roles, RLS for both project types.
- Standard Radio fully real end-to-end (scripts → audio → transcription → QC → comments →
  change requests → approval → activity).
- PRAMS sections/lines/wording groups with the full explicit-group model; editing shared
  wording and creating variant-specific overrides (cases 1–5), both schema-complete and
  UI-wired.
- Manual audio upload for both project types (no bulk matching yet).
- Initial workbook import (first import into a brand-new PRAMS project) — the diff-aware
  *re-import* schema exists from day one (§9.3), but the polished diff-review UI can ship
  slightly after the initial-import path.
- In-app notifications only.
- Basic ops visibility into `processing_jobs` dead letters.

**Later enhancements (explicitly deferred):**
- Bulk audio upload with automatic filename-to-reference matching (case 8) — MVP ships
  manual per-variant upload first.
- Full diff-review UX for workbook re-import (case 7's review-before-confirm screen) —
  MVP can require a straightforward "this file replaces sections not otherwise edited"
  guard rail before the richer diff UI exists.
- Re-merge (case 6), gated on resolving the suggestion-quality risk in §17.
- Cross-release comparison (case 10), gated on the per-update-vs-global-registry decision
  in §17.
- Email/digest notifications, Slack integration.
- Multi-studio support beyond the current single studio.
- Automated data retention/deletion, gated on the legal answer in §17.
- Normalized word-level transcript table, only if cross-version/cross-project word-level
  analytics become a real product requirement.
- Materialized (rather than plain) status views, only if the plain view underperforms at
  real scale.
