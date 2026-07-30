# Phase 2B — Workbook Import & Re-import Safety

How a PRAMS workbook becomes matrix rows/cells/wording groups, and — the harder half —
what happens the second time the same section is imported. See `docs/phase-2b-schema.md`
for the tables involved.

## The parser: `src/lib/prams-import/parser.ts`

`parseWorkbook(buffer, sheetNames)` reads one or more worksheets and returns a
`ParsedSection` per sheet — pure structure, no database access:

- **Header detection.** Scans the first 20 rows for one containing ≥2 cells matching
  `/^(\S+)\s*-\s*(.+)$/` (e.g. `"080.J2 - BOARDING"`) — that's the announcement header row.
  The section title is taken from column A of whichever row above it has text.
- **Columns.** Each matched header cell becomes a `ParsedAnnouncementColumn`
  (`columnIndex`, `referenceCodeRaw` — exactly as typed, before normalisation —
  `title`, `tags` extracted from the title text).
- **Rows.** From the row after the header until the first entirely-blank row. Each row is
  read left-to-right; a run of columns covered by one authored merge (read from
  `worksheet.model.merges`, e.g. `"C5:D5"`) becomes one `ParsedCellGroup` spanning those
  column indexes, with one `text` (or `null` for blank). Only horizontal merges count —
  a vertical/rectangular merge range is ignored, since this model has no concept of a cell
  spanning rows.
- **Nothing here infers sharing from text.** Two adjacent single-column groups with
  byte-identical text (real example: the real Boarding fixture's row 5, where the workbook's
  columns B and E both read "Hello and welcome onboard this Jet2.com flight." but are not
  merged) stay as two separate `ParsedCellGroup` entries. Whether they end up sharing a
  `prams_wording_groups` row is decided later, during commit, purely by ref-set matching —
  see below — never by comparing `.text`.

`supabase/tests/import.test.mjs`'s Part A asserts all of this directly against the real
supplied workbook (`supabase/tests/fixtures/onboard-prams-grid-july-26.xlsx`): 4 columns in
order, 5 rows in order, row 7's full 4-column merge, row 8's intentional blank, and row 5's
identical-but-unmerged pair staying independent.

## Preview: `previewImport()` in `src/lib/prams-import/import-service.ts`

Given a `ParsedSection` and a target `(project_id, section_slug)`, `previewImport` reads the
current DB structure (if any) and produces an `ImportDiff[]` — nothing is written. Matching is
by two stable keys, never by position:

- **Announcements** by normalised reference code (`normalizeCode`, mirroring the DB's
  `normalize_reference_code`) — so `"080.j2"` in a re-imported workbook still matches the
  existing `080.J2` row.
- **Rows** by `row_key` (`"row-<worksheet row index>"`) — stable across a re-import even if
  `sort_order` (the row's position in this parse) has shifted.
- **Wording groups within a row** by the *set* of reference codes currently sharing that
  group (`sameRefSet`) — if the new parse's group for a row has the exact same ref-set as an
  existing one, that's the "same" group and only its `text` is compared (`wording_changed` if
  different, `blank_changed` if either side is a blank); if no existing group has that ref-set,
  it's `sharing_changed` (the grouping itself changed, not just the wording).

All 11 diff types the plan requires are produced here: `section_added`, `announcement_added`/
`_removed`/`_renamed`, `row_added`/`_removed`/`_reordered`, `wording_changed`,
`sharing_changed`, `blank_changed`. (`section_changed` is reserved in the check constraint for
a future section-level rename/move but isn't emitted by the current diff logic — nothing in
this phase's scope changes a section's own name/slug independently of a full re-import.)

`supabase/tests/import.test.mjs`'s Part D exercises every diff type except `section_changed`
against a small hand-built synthetic section (chosen over a second real workbook so each diff
type could be triggered in isolation and asserted on precisely).

## Commit: `createImportRecord` → `persistDiffs` → `confirmImport`

The actual write path, in the order the frontend import workflow is expected to call it:

1. `createImportRecord` — one `prams_workbook_imports` row, `status = 'pending_review'`.
2. `persistDiffs` — the diffs from `previewImport`, persisted as `prams_workbook_import_diffs`
   rows *before* commit, so the audit trail exists even for an import that's later discarded.
3. `confirmImport` — applies the plan:
   - Upserts the section (creates it if new, otherwise just stamps `source_import_id`).
   - Upserts every column's global `prams_announcements` row (creating it if the reference
     code is genuinely new) and its per-project `prams_announcement_versions` row.
   - Any reference active in the section before, but absent from this parse, is set
     `status = 'removed'` — **never deleted**.
   - Upserts every row (`prams_matrix_rows`, keyed on `row_key`) and every
     `(row, announcement_version)` cell (`prams_matrix_cells`) — a cell already at that
     coordinate is reused, never duplicated (the table's own unique constraint would reject a
     duplicate anyway).
   - **Wording is only regenerated for rows the preview flagged as changed** (`changedRowKeys`,
     derived from which row keys appear in the diff list) or that are brand new. An existing,
     unflagged row's wording groups and memberships are left completely untouched — this is
     the mechanism that makes a re-import non-destructive to unrelated rows, not just to
     unrelated sections.
   - For a row that *is* regenerated, every one of that row's cells has its current membership
     retired (`is_current = false`, never deleted) before the fresh groups/memberships are
     inserted, with `replaces_membership_id` chaining each new membership back to whatever it
     replaced.
   - Any row previously active but absent from this parse is marked `status = 'removed'` —
     never deleted.
   - Finally, `prams_workbook_imports.status` flips to `'confirmed'` and one `activity_events`
     row (`action = 'import_committed'`) is logged.

## Re-import safety: what's actually proven

`supabase/tests/import.test.mjs` Part C imports the real Boarding fixture into a fresh
project, then **imports the identical workbook a second time** and asserts, concretely:

- The preview reports **zero** structural diffs (beyond the one-time `section_added`, which
  only fires when the section didn't exist yet — it won't recur on a genuine second import
  into the same section).
- Every row's current `wording_group` ids are **byte-identical** before and after — nothing
  was regenerated, because nothing changed.
- `activity_events` for the project **only grew** (exactly one new `import_committed` row);
  none of the rows from the first import's activity disappeared.

Part D then re-imports a *changed* synthetic section and proves the finer-grained claim: a row
with **zero** detected diffs (`row-10` in that test) keeps its original wording-group id
untouched, while only the rows actually flagged (`row-5`, `row-6`, `row-7`) get fresh groups —
and even for a flagged row, the old membership rows are retired, not deleted (queryable via
`replaces_membership_id`, same as the wording-operations tests prove for manual edits). A
removed row (`row-8`) is confirmed `status = 'removed'` in the database, not gone, and a
renamed announcement's version row is updated in place (title only — its identity, and every
prior version's history, is untouched).

## Known limitation: commit is not one database transaction

`confirmImport` issues its writes as a sequence of `supabase-js` calls, not one Postgres
transaction — `supabase-js` has no cross-statement transaction API, and wrapping the whole
flow in a single RPC function (as the three wording operations do) would mean re-implementing
the entire diff-and-commit logic in PL/pgSQL. This is accepted for Phase 2B specifically
because:

- Every individual write is additive or a soft-status-flip — nothing is ever deleted, so a
  failure partway through leaves a partial-but-recoverable state, not corruption.
- The operation is already gated behind an explicit human preview-then-confirm step, not
  triggered by an automated pipeline where a partial failure could go unnoticed.

See `docs/phase-2b-limitations.md` for this and the other limitations carried forward from
this round.
