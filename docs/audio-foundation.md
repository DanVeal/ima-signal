# Phase 2C.1 — Audio Foundation

Audio as a first-class citizen of IMA Signal: upload, bulk upload with filename matching,
browse, listen, replace, version history, and waveform previews — all backed by real
Supabase Storage and real `ffprobe`/`ffmpeg`-extracted metadata, no mock data anywhere in the
audio path. Explicitly excludes transcription, comments, approvals, change requests, QC, and
any ElevenLabs integration — those remain future phases.

## Architecture

Two tables, mirroring the content/current-pointer split Phase 2B established for PRAMS
wording (`prams_wording_groups` + `prams_wording_group_members`):

```
audio_items                          — identity: "the recording attached to X"
  script_variant_id  (nullable, FK)  ─┐ exactly one of these two is set
  announcement_version_id (nullable) ─┘ (a check constraint enforces it)
  current_version_id  (nullable FK) → points at the CURRENT audio_versions row

audio_versions                       — one immutable uploaded file
  audio_item_id (FK)
  version_number, uploaded_by_user_id, original_filename
  storage_bucket, storage_path
  file_size_bytes, file_checksum
  duration_seconds, codec, sample_rate_hz, channels, bit_rate_bps, container_format
  waveform_peaks (jsonb — ~200 floats in [0,1])
  restored_from_version_id (nullable, self-FK)
```

`audio_items` is created lazily — a variant or announcement version has no `audio_items` row
at all until someone uploads to it, which is exactly what "missing audio" means downstream
(the dashboard's missing-audio count is `total subjects − audio_items with a current version`,
not a separate flag anywhere).

Standard Radio and PRAMS share this **one** audio system — an `audio_items` row's subject is
either a `script_variants.id` or a `prams_announcement_versions.id`, resolved via
`audio_subject_project_id(script_variant_id, announcement_version_id)`, the audio-domain
equivalent of Phase 2A/2B's `can_access_project`.

### Why `audio_versions` has no `is_current` column

Early in this phase, `audio_versions` briefly had an `is_current boolean` column. It was
removed in favour of `audio_items.current_version_id` because putting "current" on the
immutable-content table would have meant an UPDATE to `audio_versions` every time a new
version was created (to flip the old row's flag) — which is exactly the "never overwrite"
guarantee this phase is built to protect. With the pointer on `audio_items` instead,
`audio_versions` is genuinely insert-only: no UPDATE grant, no UPDATE policy, full stop.

## Storage

One private bucket, `audio-recordings` (created via migration, `public = false`, 200MiB
`file_size_limit`). Object paths are structured and RLS-relevant:

```
{project_id}/{audio_item_id}/{random-uuid}-{sanitised-original-filename}
```

`storage.foldername(name)` returns every path segment except the filename, so
`(storage.foldername(name))[1]` is always the project id — the same value every other RLS
policy in this schema keys off. Two policies on `storage.objects`:

- **Upload (INSERT)** — `can_upload_audio_for_project(project_id_from_path)`: IMA admin/producer
  anywhere, a studio only for its own project.
- **Playback (SELECT)** — `can_access_project(project_id_from_path)`: anyone who can see the
  project at all, which is what makes Jet2's access "playback only" — they satisfy this policy
  but never the upload one.

No UPDATE or DELETE policy exists on this bucket. An uploaded object is as immutable as its
`audio_versions` row; replacing a recording writes a new object at a new path, nothing already
in storage is ever touched again.

### Signed URLs, not public files

Every read or write of the actual bytes goes through a signed URL, issued server-side by the
signed-in user's own request-scoped Supabase client (never the service role for this path):

- **Upload**: `requestUploadSlot()` (`src/lib/audio-upload/service.ts`) finds-or-creates the
  `audio_items` row (RLS-checked — an unauthorised subject fails right here), then calls
  `storage.createSignedUploadUrl(path)`, itself RLS-checked against the INSERT policy above.
  The client then uploads bytes directly to Storage using that URL — large files never pass
  through the Next.js server at all.
- **Playback**: `getPlaybackUrl()` calls `storage.createSignedUrl(path, 600)` (10-minute
  expiry), RLS-checked against the SELECT policy. `RealAudioPlaybackProvider`
  (`src/lib/audio-playback-context.tsx`) points a real `<audio>` element at it.

Both are proven directly in `supabase/tests/rls.test.mjs` §12: a studio uploader gets a
working signed upload URL for their own project and a rejection for another studio's; a Jet2
reviewer is rejected for upload but succeeds for playback.

## Versioning

Every upload — first or replacement — goes through the `create_audio_version` Postgres RPC
function (`SECURITY INVOKER`, same pattern as Phase 2B's wording operations): computes the
next `version_number`, inserts a brand-new `audio_versions` row, repoints
`audio_items.current_version_id`, and logs an `activity_events` row (`audio_uploaded` for the
first version, `audio_version_created` for a replacement). One function call, one transaction,
genuinely atomic — no existing row is ever touched.

**Restore** (`restore_audio_version`) makes an older version current again without
re-uploading anything: the target version's storage path and metadata still exist (nothing is
ever deleted from Storage or the database), so this copies them into a brand-new
`audio_versions` row with `restored_from_version_id` set, and repoints `current_version_id` —
full lineage preserved, the version being "undone" stays exactly as it was.

`supabase/tests/audio-upload.test.mjs` proves the full chain end-to-end: upload → replace
(version 2, version 1 untouched) → restore version 1 (version 3, versions 1 and 2 untouched,
`current_version_id` now on version 3).

## Filename matching

`src/lib/audio-upload/matcher.ts` — pure functions, no I/O, no database access. For each
uploaded file, tries four tiers in order against every variant/reference code in the project,
stopping at the first tier with exactly one hit:

1. **Exact** — byte-for-byte match against the code.
2. **Case-insensitive** — same, lowercased.
3. **Whitespace-insensitive** — same, with all whitespace stripped from both sides.
4. **Reference-code substring** — the filename *contains* a code (e.g.
   `"Boarding_080A.J2_v2_FINAL.wav"` contains `"080A.J2"`); ties broken by preferring the
   longest (most specific) code.

A file that matches none of the four, but still contains something shaped like a code (an
uppercase run of the form `AB12` or `080A.J2` — deliberately case-*sensitive*, since real codes
in this system are always written in caps and ordinary English filenames aren't), is flagged
`unknown_reference` rather than plain `unmatched` — a nudge that it's probably a typo or the
wrong project, not just an unrelated file. Two equal-length codes both present as substrings
is `ambiguous`.

**Duplicate detection** happens two ways: against the target's *current* version (a client-side
SHA-256 of the file, compared to `audio_items → audio_versions.file_checksum`, fetched once per
batch via `getMatchTargetsForProject`) and *within the batch itself* (two files with identical
bytes, regardless of name). Neither blocks the match — a duplicate is still shown as matched,
just excluded from "ready to import" and flagged with a warning, since a legitimate replace can
coincidentally have the same bytes as what's already current and the user should decide, not
have it silently skipped or silently imported.

The user always sees the full classification (Matched / Unmatched / Ambiguous / Unknown
reference / Duplicate, plus every warning) before anything uploads — see
`src/components/recordings/upload-workflow.tsx`.

## Waveform generation

`src/lib/audio/waveform.ts` decodes the actual uploaded file — any format the bundled static
`ffmpeg` binary supports (mp3, wav, aac/m4a, flac, ogg, ...) — to raw 16-bit mono PCM at 8kHz
via `ffmpeg -i <file> -f s16le -ac 1 -ar 8000 pipe:1`, then reduces that to a fixed number of
peak buckets (200 by default) in plain JavaScript: each bucket's value is the maximum absolute
sample amplitude within it, normalised to `[0, 1]`.

This runs **once**, at upload time, as part of `processUploadedAudio()`
(`src/lib/audio/process-upload.ts`), and the result is stored permanently on
`audio_versions.waveform_peaks` — never regenerated, because the row it lives on is immutable.

`Waveform` (`src/components/audio/waveform.tsx`) and the new `StaticWaveform`
(`src/components/audio/static-waveform.tsx`, for non-interactive previews — browse rows,
dashboard, latest recordings) both render real peaks when supplied. The interactive `Waveform`
falls back to its pre-existing deterministic seeded shape only for the mock-data-driven
QC/review screens that have no real audio at all — every Phase 2C.1 recording has real peaks.

`supabase/tests/audio-metadata-waveform.test.mjs` proves this against real fixtures: a
fade-in/fade-out tone's opening peaks are measurably quieter than its sustained middle — a real
envelope, not a fabricated one.

## Metadata extraction

`src/lib/audio/metadata.ts` runs the bundled static `ffprobe` binary
(`ffprobe -print_format json -show_format -show_streams`) and extracts: duration, codec,
sample rate, channel count, bit rate, and container format. File size and a SHA-256 checksum
are computed directly from the buffer (`src/lib/audio/checksum.ts`). All of it is extracted
**once**, at upload time, and stored — nothing here is inferred or entered by hand.

Both `ffmpeg` and `ffprobe` come from `ffmpeg-static`/`ffprobe-static` (statically-linked
binaries bundled by the npm package, downloaded at `pnpm install` time) — no system `ffmpeg`
install is required or assumed. **Next.js config note:** these packages resolve their binary
path via `__dirname` at require-time; bundling them (Next's default for server code) rewrites
that path and breaks it. `next.config.ts` lists both in `serverExternalPackages` so Next
requires them unbundled, straight from `node_modules`.

## Performance

Bulk upload never proxies file bytes through the Next.js server — the client uploads directly
to Supabase Storage using a signed URL obtained per-file, and the (comparatively fast) metadata/
waveform extraction step downloads and processes one file per server request. The client-side
orchestrator (`src/lib/audio-upload/use-bulk-upload.ts`) caps concurrency at 4 in-flight
uploads at a time — a simple async queue, not a true background job system (there is no job
queue in this stack; see Known Limitations) — so 150+ queued files never mean 150+ simultaneous
requests, keeping both the browser and the server responsive.

`supabase/tests/audio-upload.test.mjs`'s bulk section is the concrete evidence: 20 real files,
concurrency-capped at 5, uploaded/processed (real signed URL, real byte upload, real ffprobe/
ffmpeg run, real DB write) end-to-end in well under a second in this environment. Scaling that
linearly to 150+ files at the same concurrency is comfortably within the kind of wait time a
bulk-upload screen is expected to show a progress bar for — the design (bounded concurrency,
real per-file progress/state, no full-list re-render blocking) is what makes that scale, not a
number that stops being true past some threshold.

Rendering scales the same way: the file list is a flat array keyed by a stable per-row id (a Map
under the hood), so adding/updating one row's progress only re-renders that row, not the whole
list — this was a deliberate reason to use a `Map<string, UploadRow>` instead of re-scanning an
array on every progress tick.

## Security (RLS)

Every table and the storage bucket follow the same shape already established: read gated to
`can_access_project`, write gated to a purpose-built predicate,
`can_upload_audio_for_project(project_id)` — true for `ima_admin`/`ima_producer` anywhere, true
for `studio_admin`/`studio_contributor` only for a project assigned to their own studio
organisation, **never** true for any Jet2 role. This is the concrete arrival of what
`docs/phase-2a-rls.md` had already flagged and deferred: *"Phase 2B adds studio audio-upload
write access"* — it didn't happen in Phase 2B (out of scope there), so this is where it lands.

Proven directly in `supabase/tests/rls.test.mjs` §12 (12 assertions):

- IMA admin/producer can upload anywhere.
- Studio can upload to their own project; **cannot** to a different studio's project.
- Jet2 (any role) cannot create an `audio_items` row or a signed upload URL anywhere —
  playback only.
- Jet2 **can** read `audio_items`/`audio_versions` rows and get a signed *playback* URL for a
  project they can access.
- `audio_versions` cannot be updated by anyone, including `ima_admin` — no UPDATE grant, no
  UPDATE policy. Immutability is enforced at the database, not by application discipline.
- `create_audio_version` correctly repoints `current_version_id` and logs a real
  `activity_events` row.

### A real bug this caught: self-referential RLS and `INSERT ... RETURNING`

While writing these tests, `audio_items_select_accessible` (and the analogous `UPDATE` policy)
were originally written as `can_access_project(audio_item_project_id(id))` —
`audio_item_project_id` re-queries `audio_items` by `id` to resolve the subject. That's fine for
an ordinary `SELECT`, but a **studio** uploader's `INSERT ... RETURNING` (exactly what
`supabase-js`'s `.insert().select()` generates) failed RLS even though the identical predicate,
evaluated as a plain expression against the same values, returned `true`. The `RETURNING`
clause's implicit re-check apparently doesn't see a row inserted earlier in the *same* command
when the check re-queries the very table the policy is attached to — an IMA-manager upload
never hit this (`is_ima_manager()` short-circuits without ever touching `audio_items`), which is
why it wasn't caught until the studio-specific test was written. Fixed by having both policies
resolve the project directly from the row's own columns
(`audio_subject_project_id(script_variant_id, announcement_version_id)`) instead of re-querying
the table — sidesteps the self-reference entirely. See the comment in
`supabase/migrations/20260731100000_audio_domain.sql` for the full explanation, left in place so
the next person extending this table's RLS doesn't reintroduce it.

## Known limitations

**No background job queue — "background processing" means bounded client concurrency.** This
stack has no job queue, no worker process, and no cron. "Background processing" for bulk
upload means the client's concurrency-capped orchestrator plus one server round-trip per file
for metadata/waveform extraction — genuinely non-blocking and scalable (see Performance above),
but not a durable queue: if the browser tab closes mid-batch, in-flight uploads are simply
abandoned (already-completed ones are safely persisted; nothing corrupts, but nothing resumes
automatically either). A real queue (e.g. Postgres-backed job table + a worker, or Supabase Edge
Functions once re-enabled) is future work if resumable/very-large batches become a requirement.

**Audio seeding is a separate script, not part of `supabase db reset`.** Every other table in
this schema is fully reconstructed by migrations + `seed.sql` in one command. Audio can't be:
`seed.sql` is pure SQL and has no way to place real bytes into Supabase Storage's backing
store. `supabase/seed-audio.mjs` (run separately: `node --env-file=.env.local --import tsx
supabase/seed-audio.mjs`) uploads a few real fixture tones through the actual pipeline
(real Storage objects, real ffprobe/ffmpeg extraction) against real seeded variants/
announcements, specifically so "no mock data" holds for audio too, not just the schema.

**A Docker-networking quirk in this sandbox, not a code issue:** Kong (the local API gateway)
resolves the Storage/Auth containers' IPs once and caches them; when `supabase db reset`
recreates the Postgres container, Storage and Auth restart too (fresh container, fresh IP), but
Kong doesn't notice until it's also restarted (`docker restart supabase_kong_ima-signal`).
Symptom: uploads/signed URLs return 502 immediately after a reset. This is pre-existing local-
stack behaviour, unrelated to anything built in this phase, but worth knowing before assuming a
502 means a real regression.

**Client-side hashing reads the whole file into memory** (`crypto.subtle.digest` over
`file.arrayBuffer()`) for duplicate detection before upload. Fine for radio-ad-scale files
(seconds to a few minutes of audio); would need streaming/chunked hashing for much larger
files (e.g. multi-hour recordings), which this system isn't scoped for.

**The existing mock-driven review pages are untouched, same reasoning as Phase 2A/2B.**
`/projects/[projectId]/audio/[audioItemId]` (comments, change requests, transcript/QC) still
reads `src/lib/mock/` — those depend on tables that don't exist yet (comments, change_requests,
approvals, transcripts), explicitly out of scope this phase. The new, fully-real UI lives at
`/projects/[projectId]/recordings` (browse), `/recordings/upload` (bulk upload), and
`/recordings/[audioItemId]` (player + version history + restore) — separate routes, not a
replacement, following the `/prams-registry`/`/scripts-registry` precedent. The dashboard gained
one clearly-labelled real section ("Recordings (live)") rather than having any of its existing
mock-driven numbers replaced.

**Signed playback URLs are short-lived (10 minutes)** and re-issued per page load — there's no
client-side caching/refresh-before-expiry logic, so a recording left open in a background tab
for over 10 minutes would need a page refresh to keep playing from where it stopped loading.
Acceptable for a review workflow, not for a "leave it playing all day" use case.
