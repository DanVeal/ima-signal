"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  confirmMultiSectionImport,
  discardWorkbookImport,
  listWorkbookSheets,
  previewMultiSectionImport,
  type SectionPreviewResult,
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

type Phase = "select-file" | "select-sheets" | "review" | "done";

export function RealImportWorkflow({ projectId }: { projectId: string; sections: SectionRow[] }) {
  const [phase, setPhase] = useState<Phase>("select-file");
  const [isPending, startTransition] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [previewError, setPreviewError] = useState<string | undefined>();
  const [results, setResults] = useState<SectionPreviewResult[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [discarding, startDiscard] = useTransition();
  const [discarded, setDiscarded] = useState(false);

  function handleChooseFile(chosen: File) {
    setFile(chosen);
    setFileError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", chosen);
      const state = await listWorkbookSheets(formData);
      if (state.error || !state.sheetNames) {
        setFileError(state.error ?? "Couldn't read that file.");
        return;
      }
      setSheetNames(state.sheetNames);
      setSelected(Object.fromEntries(state.sheetNames.map((name) => [name, true])));
      setPhase("select-sheets");
    });
  }

  function handlePreview() {
    if (!file) return;
    const selections = sheetNames.filter((name) => selected[name]);
    if (selections.length === 0) {
      setPreviewError("Select at least one sheet to import.");
      return;
    }
    setPreviewError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);
      selections.forEach((name) => formData.append("sheetNames", name));
      const state = await previewMultiSectionImport(formData);
      if (state.error) {
        setPreviewError(state.error);
        setResults(state.results ?? []);
        return;
      }
      setResults(state.results ?? []);
      setImportId(state.importId ?? null);
      setPhase("review");
    });
  }

  function handleConfirm() {
    if (!importId) return;
    setConfirmError(undefined);
    startTransition(async () => {
      const state = await confirmMultiSectionImport(importId);
      if (state.error) {
        setConfirmError(state.error);
        return;
      }
      setPhase("done");
    });
  }

  if (phase === "done") {
    return (
      <div className="rounded-lg border border-success/25 bg-success-100/30 px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-success-100 text-success">
          <CheckCircle2 className="size-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-text-primary">Import confirmed</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          Every selected section&apos;s structure now reflects this workbook. Nothing was deleted — anything
          removed from the workbook is marked removed, not erased.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button render={<Link href={`/projects/${projectId}`} />}>Back to project</Button>
          <Button variant="outline" render={<Link href={`/projects/${projectId}/recordings/upload`} />}>
            Upload recordings
          </Button>
          <Button variant="outline" type="button" onClick={() => window.location.reload()}>
            Import another workbook
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "review" && !discarded) {
    const importable = results.filter((r) => !r.error && r.diffs.length > 0);
    const skipped = results.filter((r) => r.error || r.diffs.length === 0);

    return (
      <div className="space-y-5">
        {importable.map((section) => {
          const counts = section.diffs.reduce<Partial<Record<ImportDiffType, number>>>((acc, d) => {
            acc[d.diffType] = (acc[d.diffType] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <div key={`${section.sheetName}-${section.sectionSlug}`} className="space-y-3 rounded-lg border border-border p-5">
              <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                {section.sectionIsNew ? "New section — " : "Changes to "}
                {section.sectionTitle} <span className="normal-case">({section.sheetName})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(counts).map(([type, count]) => (
                  <span key={type} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                    {count} {DIFF_LABEL[type as ImportDiffType]}
                  </span>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border-subtle">
                <div className="divide-y divide-border-subtle">
                  {section.diffs.map((diff, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm font-medium text-text-primary">{DIFF_LABEL[diff.diffType]}</span>
                      <span className="truncate text-xs text-text-muted">
                        {diff.referenceCode ?? diff.rowKey ?? ""}
                        {"before" in diff.payload && diff.payload.before != null ? ` — was "${diff.payload.before}"` : ""}
                        {"after" in diff.payload && diff.payload.after != null ? ` → "${diff.payload.after}"` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {skipped.length > 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-3">
            <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">Skipped</p>
            <ul className="space-y-1 text-sm text-text-muted">
              {skipped.map((s) => (
                <li key={`${s.sheetName}-${s.sectionSlug}`}>
                  <span className="font-medium text-text-secondary">
                    {s.sectionTitle} ({s.sheetName})
                  </span>{" "}
                  — {s.error ?? "no changes detected"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmError && (
          <p className="flex items-start gap-1.5 rounded-md bg-important-100 px-3 py-2 text-sm text-important">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {confirmError}
          </p>
        )}

        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={discarding}
            onClick={() =>
              startDiscard(async () => {
                if (importId) await discardWorkbookImport(importId);
                setDiscarded(true);
              })
            }
          >
            {discarding && <Loader2 className="size-3.5 animate-spin" />}
            Discard
          </Button>
          <Button type="button" disabled={isPending} onClick={handleConfirm}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Applying…" : `Confirm import (${importable.length} section${importable.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "select-sheets") {
    const anySelected = sheetNames.some((name) => selected[name]);
    return (
      <div className="max-w-lg space-y-5">
        <div>
          <p className="text-sm font-medium text-text-emphasis">Choose which tabs to import</p>
          <p className="mt-1 text-xs text-text-muted">
            Each tab becomes one section (or several, for tabs that stack multiple standalone announcements in one
            column) — matched to an existing section by name where one already exists, or created new.
          </p>
        </div>

        <div className="divide-y divide-border-subtle rounded-lg border border-border">
          {sheetNames.map((name) => (
            <label key={name} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <Checkbox
                checked={selected[name] ?? false}
                onCheckedChange={(checked) => setSelected((prev) => ({ ...prev, [name]: !!checked }))}
              />
              <p className="truncate text-sm font-medium text-text-primary">{name}</p>
            </label>
          ))}
        </div>

        {previewError && (
          <p className="flex items-start gap-1.5 rounded-md bg-important-100 px-3 py-2 text-sm text-important">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {previewError}
          </p>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => setPhase("select-file")}>
            Back
          </Button>
          <Button type="button" disabled={isPending || !anySelected} onClick={handlePreview}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isPending ? "Comparing…" : "Preview changes"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-10 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <FileSpreadsheet className="size-5" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-text-emphasis">Select the updated PRAMS workbook</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          .xlsx file exported from the PRAMS master document. Every tab in it can become a section.
        </p>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {isPending ? "Reading workbook…" : "Choose file"}
          <input
            type="file"
            accept=".xlsx"
            className="sr-only"
            disabled={isPending}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) handleChooseFile(chosen);
            }}
          />
        </label>
      </div>

      {fileError && (
        <p className="flex items-start gap-1.5 rounded-md bg-important-100 px-3 py-2 text-sm text-important">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {fileError}
        </p>
      )}
    </div>
  );
}
