"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  confirmWorkbookImport,
  discardWorkbookImport,
  previewWorkbookImport,
  type ConfirmImportState,
  type PreviewImportState,
} from "@/lib/prams-import/actions";
import type { Database } from "@/lib/supabase/database.types";
import type { ImportDiffType } from "@/lib/prams-import/import-service";

type SectionRow = Database["public"]["Tables"]["prams_sections"]["Row"];

const DIFF_LABEL: Record<ImportDiffType, string> = {
  section_added: "New section",
  section_changed: "Section changed",
  announcement_added: "New announcement",
  announcement_removed: "Announcement removed",
  announcement_renamed: "Announcement renamed",
  row_added: "New row",
  row_removed: "Row removed",
  row_reordered: "Row reordered",
  wording_changed: "Wording changed",
  sharing_changed: "Sharing changed",
  blank_changed: "Blank/wording toggled",
};

const previewInitialState: PreviewImportState = {};
const confirmInitialState: ConfirmImportState = {};

export function RealImportWorkflow({ projectId, sections }: { projectId: string; sections: SectionRow[] }) {
  const [previewState, previewAction, previewPending] = useActionState(previewWorkbookImport, previewInitialState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmWorkbookImport, confirmInitialState);
  const [sectionMode, setSectionMode] = useState<"existing" | "new">(sections.length > 0 ? "existing" : "new");
  const [discarding, startDiscard] = useTransition();
  const [discarded, setDiscarded] = useState(false);

  const result = previewState.result;

  if (confirmState.confirmed) {
    return (
      <div className="rounded-lg border border-success/25 bg-success-100/30 px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-success-100 text-success">
          <CheckCircle2 className="size-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-text-primary">Import confirmed</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          The section&apos;s structure now reflects this workbook. Nothing was deleted — anything removed from
          the workbook is marked removed, not erased.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button render={<Link href={`/projects/${projectId}`} />}>Back to project</Button>
          <Button variant="outline" render={<Link href={`/projects/${projectId}/recordings/upload`} />}>
            Upload recordings
          </Button>
          <Button variant="outline" type="button" onClick={() => window.location.reload()}>
            Import another section
          </Button>
        </div>
      </div>
    );
  }

  if (result && !discarded) {
    const counts = result.diffs.reduce<Partial<Record<ImportDiffType, number>>>((acc, d) => {
      acc[d.diffType] = (acc[d.diffType] ?? 0) + 1;
      return acc;
    }, {});

    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-border p-5">
          <p className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">
            {result.sectionIsNew ? "New section — " : "Changes to "}
            {result.sectionSlug}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([type, count]) => (
              <span
                key={type}
                className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700"
              >
                {count} {DIFF_LABEL[type as ImportDiffType]}
              </span>
            ))}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {result.diffs.map((diff, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-medium text-text-primary">{DIFF_LABEL[diff.diffType]}</span>
                <span className="truncate text-xs text-text-muted">
                  {diff.referenceCode ?? diff.rowKey ?? ""}
                  {"before" in diff.payload && diff.payload.before != null
                    ? ` — was "${diff.payload.before}"`
                    : ""}
                  {"after" in diff.payload && diff.payload.after != null ? ` → "${diff.payload.after}"` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {confirmState.error && (
          <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">{confirmState.error}</p>
        )}

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={discarding}
            onClick={() =>
              startDiscard(async () => {
                await discardWorkbookImport(result.importId);
                setDiscarded(true);
              })
            }
          >
            {discarding && <Loader2 className="size-3.5 animate-spin" />}
            Discard
          </Button>
          <form action={confirmAction}>
            <input type="hidden" name="importId" value={result.importId} />
            <Button type="submit" disabled={confirmPending}>
              {confirmPending && <Loader2 className="size-3.5 animate-spin" />}
              {confirmPending ? "Applying…" : "Confirm import"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={previewAction} onSubmit={() => setDiscarded(false)} className="max-w-lg space-y-5">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <FileSpreadsheet className="size-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-text-emphasis">Select the updated PRAMS workbook</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          .xlsx file exported from the PRAMS master document.
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90">
          <Upload className="size-3.5" />
          Choose file
          <input type="file" name="file" accept=".xlsx" required className="sr-only" />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="import-sheet-name">Sheet name</Label>
        <Input id="import-sheet-name" name="sheetName" required placeholder="e.g. Boarding Charters" />
        <p className="text-xs text-text-muted">The exact worksheet tab name in the workbook.</p>
      </div>

      <div className="space-y-2">
        <Label>Section</Label>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={sectionMode === "existing" ? "default" : "outline"}
            onClick={() => setSectionMode("existing")}
            disabled={sections.length === 0}
          >
            Existing section
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sectionMode === "new" ? "default" : "outline"}
            onClick={() => setSectionMode("new")}
          >
            New section
          </Button>
        </div>

        {sectionMode === "existing" ? (
          <Select name="sectionSlug" required>
            <SelectTrigger id="import-section-slug">
              <SelectValue placeholder="Select a section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((section) => (
                <SelectItem key={section.id} value={section.slug}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input name="sectionSlug" required placeholder="e.g. safety-demonstration" />
        )}
      </div>

      {previewState.error && (
        <p className="flex items-start gap-1.5 rounded-md bg-important-100 px-3 py-2 text-sm text-important">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {previewState.error}
        </p>
      )}

      <Button type="submit" disabled={previewPending}>
        {previewPending && <Loader2 className="size-3.5 animate-spin" />}
        {previewPending ? "Comparing…" : "Preview changes"}
      </Button>
    </form>
  );
}
