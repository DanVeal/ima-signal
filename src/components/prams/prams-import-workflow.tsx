"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Copy,
  FileAudio,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRAMS_SECTIONS, PRAMS_VARIANTS } from "@/lib/mock/prams-library";

type Step = "workbook" | "audio" | "summary";

interface MatchResult {
  file: File;
  variantCode?: string;
  fullReference?: string;
  duplicate: boolean;
}

function normalize(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const STEPS: { id: Step; label: string }[] = [
  { id: "workbook", label: "Import workbook" },
  { id: "audio", label: "Bulk upload audio" },
  { id: "summary", label: "Review & confirm" },
];

/**
 * Frontend-only prototype for the PRAMS bulk workflow: importing a workbook
 * and bulk-uploading audio. Filenames are matched client-side against the
 * PRAMS reference codes already in this project's data — nothing is
 * uploaded, parsed on a server, or persisted. The purpose is to establish
 * the right UX before Phase 2 wires up real processing.
 */
export function PramsImportWorkflow({ projectId }: { projectId: string }) {
  const [step, setStep] = useState<Step>("workbook");
  const [workbookFile, setWorkbookFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const seenCodes = new Set<string>();
  const matches: MatchResult[] = files.map((file) => {
    const normalizedName = normalize(file.name);
    const variant = PRAMS_VARIANTS.find((v) => normalizedName.includes(normalize(v.code)));
    const duplicate = variant ? seenCodes.has(variant.code) : false;
    if (variant) seenCodes.add(variant.code);
    return { file, variantCode: variant?.code, fullReference: variant?.fullReference, duplicate };
  });
  const matched = matches.filter((m) => m.variantCode && !m.duplicate);
  const duplicates = matches.filter((m) => m.duplicate);
  const unmatched = matches.filter((m) => !m.variantCode);

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary"
      >
        <ChevronLeft className="size-3.5" />
        PRAMS — July 2026 Update
      </Link>

      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isPast = STEPS.findIndex((x) => x.id === step) > i;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-brand text-white"
                    : isPast
                      ? "bg-success-100 text-success"
                      : "bg-ink-100 text-text-muted"
                }`}
              >
                {isPast ? <CheckCircle2 className="size-3.5" /> : i + 1}
              </span>
              <span className={`text-sm font-medium ${isActive ? "text-text-primary" : "text-text-muted"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border-subtle" />}
            </div>
          );
        })}
      </div>

      {step === "workbook" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
              <FileSpreadsheet className="size-5" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-medium text-text-emphasis">
              {workbookFile ? workbookFile.name : "Select the updated PRAMS workbook"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              .xlsx file exported from the PRAMS master document. Nothing is uploaded in this prototype —
              this establishes the intended workflow ahead of Phase 2.
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90">
              <Upload className="size-3.5" />
              Choose file
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => setWorkbookFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {workbookFile && (
            <div className="rounded-lg border border-border p-5">
              <p className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">
                Detected in this workbook
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xl font-semibold text-text-primary">{PRAMS_SECTIONS.length}</p>
                  <p className="text-xs text-text-secondary">Announcement sections</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-text-primary">{PRAMS_VARIANTS.length}</p>
                  <p className="text-xs text-text-secondary">Announcement variants</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-text-primary">
                    {PRAMS_SECTIONS.filter((s) => s.available).length}
                  </p>
                  <p className="text-xs text-text-secondary">Sections already transcribed</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={!workbookFile} onClick={() => setStep("audio")}>
              Continue to audio upload
            </Button>
          </div>
        </div>
      )}

      {step === "audio" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-ink-100 text-ink-500">
              <FileAudio className="size-5" strokeWidth={1.75} />
            </div>
            <p className="text-sm font-medium text-text-emphasis">Bulk upload announcement audio</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              Select every recording for this update. Filenames are matched against PRAMS references
              locally in your browser — nothing is uploaded in this prototype.
            </p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90">
              <Upload className="size-3.5" />
              Choose files
              <input
                type="file"
                multiple
                accept="audio/*"
                className="sr-only"
                onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              />
            </label>
          </div>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-success/25 bg-success-100/40 px-4 py-3">
                  <p className="text-xl font-semibold text-success">{matched.length}</p>
                  <p className="text-xs text-text-secondary">Matched</p>
                </div>
                <div className="rounded-lg border border-important/25 bg-important-100/40 px-4 py-3">
                  <p className="text-xl font-semibold text-important">{unmatched.length}</p>
                  <p className="text-xs text-text-secondary">Unmatched</p>
                </div>
                <div className="rounded-lg border border-signal-600/25 bg-signal-100/40 px-4 py-3">
                  <p className="text-xl font-semibold text-signal-600">{duplicates.length}</p>
                  <p className="text-xs text-text-secondary">Duplicates</p>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <div className="divide-y divide-border-subtle">
                  {matches.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="truncate text-sm text-text-emphasis">{m.file.name}</span>
                      {m.duplicate ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-signal-600">
                          <Copy className="size-3.5" />
                          Duplicate of {m.variantCode}
                        </span>
                      ) : m.variantCode ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="size-3.5" />
                          {m.fullReference}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-important">
                          <AlertTriangle className="size-3.5" />
                          No matching reference found
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("workbook")}>
              Back
            </Button>
            <Button disabled={files.length === 0} onClick={() => setStep("summary")}>
              Continue to review
            </Button>
          </div>
        </div>
      )}

      {step === "summary" && !confirmed && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border p-5">
            <p className="mb-3 text-xs font-medium tracking-wide text-text-muted uppercase">Import summary</p>
            <ul className="space-y-2 text-sm text-text-primary">
              <li>
                Workbook: <span className="font-medium">{workbookFile?.name}</span> —{" "}
                {PRAMS_SECTIONS.length} sections, {PRAMS_VARIANTS.length} announcement variants detected.
              </li>
              <li>
                Audio: {files.length} file{files.length === 1 ? "" : "s"} selected — {matched.length}{" "}
                matched, {unmatched.length} unmatched, {duplicates.length} duplicate
                {duplicates.length === 1 ? "" : "s"}.
              </li>
            </ul>
            {(unmatched.length > 0 || duplicates.length > 0) && (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-important-100/50 px-3 py-2 text-xs text-important">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Unmatched and duplicate files will be skipped. You can re-upload them individually from
                each announcement variant once this import is confirmed.
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("audio")}>
              Back
            </Button>
            <Button onClick={() => setConfirmed(true)}>Confirm import</Button>
          </div>
        </div>
      )}

      {step === "summary" && confirmed && (
        <div className="rounded-lg border border-success/25 bg-success-100/30 px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-success-100 text-success">
            <CheckCircle2 className="size-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium text-text-primary">Import confirmed</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
            This is a frontend prototype — nothing was actually processed or stored. In Phase 2 this step
            would queue {matched.length} matched recording{matched.length === 1 ? "" : "s"} for
            transcription and QC.
          </p>
          <Button className="mt-4" render={<Link href={`/projects/${projectId}`} />}>
            Back to PRAMS overview
          </Button>
        </div>
      )}
    </div>
  );
}
