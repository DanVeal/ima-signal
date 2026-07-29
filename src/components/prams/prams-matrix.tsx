"use client";

import { useState } from "react";
import { CheckCircle2, CircleDashed, Hourglass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  PramsApprovalStatus,
  PramsCellGroup,
  PramsLine,
  PramsPhase,
} from "@/lib/mock/prams";

const APPROVAL_CONFIG: Record<
  PramsApprovalStatus,
  { label: string; icon: typeof CircleDashed; tone: string }
> = {
  draft: { label: "Draft", icon: CircleDashed, tone: "text-ink-500 bg-ink-100" },
  ready_for_review: { label: "Ready for review", icon: Hourglass, tone: "text-signal-600 bg-signal-100" },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-success bg-success-100" },
};

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
function countWord(n: number) {
  return COUNT_WORDS[n] ?? String(n);
}

interface Selection {
  lineId: string;
  variantIds: string[];
}

interface PendingSharedEdit {
  lineId: string;
  variantIds: string[];
  newText: string;
  overrideVariantId: string | null;
}

function sameGroup(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Split a merged group so one variant gets its own wording, preserving column order. */
function splitGroupForOverride(group: PramsCellGroup, overrideVariantId: string, newText: string): PramsCellGroup[] {
  const idx = group.variantIds.indexOf(overrideVariantId);
  if (idx === -1) return [group];
  const before = group.variantIds.slice(0, idx);
  const after = group.variantIds.slice(idx + 1);
  const result: PramsCellGroup[] = [];
  if (before.length) result.push({ variantIds: before, text: group.text });
  result.push({ variantIds: [overrideVariantId], text: newText });
  if (after.length) result.push({ variantIds: after, text: group.text });
  return result;
}

export function PramsMatrix({
  phase,
  upcomingPhases,
}: {
  phase: PramsPhase;
  upcomingPhases: string[];
}) {
  const [activePhaseName, setActivePhaseName] = useState(phase.name);
  const [lines, setLines] = useState<PramsLine[]>(phase.lines);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draftText, setDraftText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingSharedEdit, setPendingSharedEdit] = useState<PendingSharedEdit | null>(null);

  const isBoardingActive = activePhaseName === phase.name;

  const selectedLine = selection ? lines.find((l) => l.id === selection.lineId) : undefined;
  const selectedGroup = selectedLine?.groups.find((g) => selection && sameGroup(g.variantIds, selection.variantIds));
  const selectedVariants = selectedGroup
    ? phase.variants.filter((v) => selectedGroup.variantIds.includes(v.id))
    : [];

  function selectGroup(lineId: string, group: PramsCellGroup) {
    setSelection({ lineId, variantIds: group.variantIds });
    setDraftText(group.text ?? "");
    setIsEditing(false);
  }

  function applyText(lineId: string, variantIds: string[], newText: string) {
    setLines((prev) =>
      prev.map((line) =>
        line.id !== lineId
          ? line
          : {
              ...line,
              groups: line.groups.map((g) => (sameGroup(g.variantIds, variantIds) ? { ...g, text: newText } : g)),
            },
      ),
    );
    setSelection({ lineId, variantIds });
    setIsEditing(false);
    setPendingSharedEdit(null);
  }

  function applyOverride(lineId: string, variantIds: string[], overrideVariantId: string, newText: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          groups: line.groups.flatMap((g) =>
            sameGroup(g.variantIds, variantIds) ? splitGroupForOverride(g, overrideVariantId, newText) : [g],
          ),
        };
      }),
    );
    setSelection({ lineId, variantIds: [overrideVariantId] });
    setIsEditing(false);
    setPendingSharedEdit(null);
  }

  function handleSaveClick() {
    if (!selection || !selectedGroup) return;
    if (selectedGroup.variantIds.length > 1) {
      setPendingSharedEdit({
        lineId: selection.lineId,
        variantIds: selectedGroup.variantIds,
        newText: draftText,
        overrideVariantId: null,
      });
    } else {
      applyText(selection.lineId, selectedGroup.variantIds, draftText);
    }
  }

  const approval = APPROVAL_CONFIG[phase.approvalStatus];
  const ApprovalIcon = approval.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <span>PRAMS</span>
        <span className="text-ink-300">›</span>
        <span className="text-ink-800">{phase.updateLabel}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[phase.name, ...upcomingPhases].map((name) => {
          const isActive = activePhaseName === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => {
                setActivePhaseName(name);
                setSelection(null);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isActive ? "bg-brand text-white" : "bg-surface-raised text-text-secondary hover:bg-ink-100",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>

      {!isBoardingActive ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink-900">{activePhaseName}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-muted">
            Not yet available in this prototype — only Boarding has been transcribed from the source PRAMS
            workbook so far.
          </p>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900 uppercase">{phase.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
              <span>{countWord(phase.variants.length)} announcement variants</span>
              <span className="text-ink-300">·</span>
              <span>{phase.updateLabel}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  approval.tone,
                )}
              >
                <ApprovalIcon className="size-3.5" strokeWidth={2.25} />
                {approval.label}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  {phase.variants.map((v) => (
                    <th
                      key={v.id}
                      className="border-b border-l border-border-subtle bg-surface-raised px-4 py-3 text-left align-top first:border-l-0"
                    >
                      <span className="block text-[13px] leading-snug font-semibold text-ink-900">
                        {v.fullReference}
                      </span>
                      {v.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {v.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-text-muted uppercase"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    {line.groups.map((group) => {
                      const isSelected =
                        selection?.lineId === line.id && sameGroup(group.variantIds, selection.variantIds);
                      const isShared = group.variantIds.length > 1 && group.text !== null;
                      const isBlank = group.text === null;
                      return (
                        <td
                          key={group.variantIds.join("+")}
                          colSpan={group.variantIds.length}
                          className="border-b border-l border-border-subtle p-1.5 align-top first:border-l-0"
                        >
                          <button
                            type="button"
                            onClick={() => selectGroup(line.id, group)}
                            className={cn(
                              "w-full rounded-md px-2.5 py-2 text-left text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                              isSelected
                                ? "bg-brand text-white"
                                : isBlank
                                  ? "text-text-muted italic hover:bg-ink-100"
                                  : isShared
                                    ? "bg-brand-100/50 text-ink-900 hover:bg-brand-100"
                                    : "text-ink-900 hover:bg-ink-100",
                            )}
                          >
                            {isBlank ? "—" : group.text}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selection && selectedLine && selectedGroup && (
            <div className="rounded-lg border border-border bg-surface-raised p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  {selectedGroup.text === null ? (
                    <p className="text-sm text-text-secondary">
                      No wording is required for this announcement variant at this point.
                    </p>
                  ) : selectedGroup.variantIds.length > 1 ? (
                    <>
                      <p className="text-sm text-text-secondary">
                        This wording is used in {countWord(selectedGroup.variantIds.length)} announcement variants.
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {selectedVariants.map((v) => (
                          <li key={v.id} className="text-sm font-medium text-ink-900">
                            {v.fullReference}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      This wording is only used in {selectedVariants[0]?.fullReference}.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  aria-label="Close editor"
                  className="rounded-md p-1 text-text-muted hover:bg-ink-100 hover:text-ink-800"
                >
                  <X className="size-4" />
                </button>
              </div>

              {selectedGroup.text !== null && (
                <>
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={4}
                        className="text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleSaveClick}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsEditing(false);
                            setDraftText(selectedGroup.text ?? "");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                      Edit wording
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <Dialog
        open={pendingSharedEdit !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSharedEdit(null);
        }}
      >
        {pendingSharedEdit && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm shared wording change</DialogTitle>
              <DialogDescription>
                This edit affects {countWord(pendingSharedEdit.variantIds.length)} announcement variants:
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-0.5 rounded-md bg-ink-100/60 px-3 py-2">
              {phase.variants
                .filter((v) => pendingSharedEdit.variantIds.includes(v.id))
                .map((v) => (
                  <li key={v.id} className="text-sm font-medium text-ink-900">
                    {v.fullReference}
                  </li>
                ))}
            </ul>

            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">
                Proposed wording
              </p>
              <p className="rounded-md border border-border-subtle bg-white px-3 py-2 text-sm text-ink-900">
                {pendingSharedEdit.newText}
              </p>
            </div>

            <div className="space-y-2 border-t border-border-subtle pt-3">
              <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                Or, save for one variant only
              </p>
              <div className="flex flex-wrap gap-1.5">
                {phase.variants
                  .filter((v) => pendingSharedEdit.variantIds.includes(v.id))
                  .map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setPendingSharedEdit((prev) => (prev ? { ...prev, overrideVariantId: v.id } : prev))
                      }
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        pendingSharedEdit.overrideVariantId === v.id
                          ? "bg-brand text-white"
                          : "bg-ink-100 text-text-secondary hover:bg-ink-200",
                      )}
                    >
                      {v.fullReference}
                    </button>
                  ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={!pendingSharedEdit.overrideVariantId}
                onClick={() => {
                  if (!pendingSharedEdit.overrideVariantId) return;
                  applyOverride(
                    pendingSharedEdit.lineId,
                    pendingSharedEdit.variantIds,
                    pendingSharedEdit.overrideVariantId,
                    pendingSharedEdit.newText,
                  );
                }}
              >
                Save as variant-specific override
              </Button>
              <Button
                onClick={() => applyText(pendingSharedEdit.lineId, pendingSharedEdit.variantIds, pendingSharedEdit.newText)}
              >
                Update shared wording
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
