"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PRAMS_CIRCUMSTANCES,
  getSectionRuns,
  type PramsSection,
} from "@/lib/mock/prams";

interface Selection {
  sectionId: string;
  code: string;
}

export function PramsMatrix({ initialSections }: { initialSections: PramsSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [selection, setSelection] = useState<Selection | null>(null);

  function updateAnnouncementBody(code: string, body: string) {
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        groups: section.groups.map((group) =>
          group.announcement.code === code
            ? { ...group, announcement: { ...group.announcement, body } }
            : group,
        ),
      })),
    );
  }

  const selectedSection = selection ? sections.find((s) => s.id === selection.sectionId) : undefined;
  const selectedGroup = selectedSection?.groups.find((g) => g.announcement.code === selection?.code);
  const selectedCircumstanceLabels = selectedGroup
    ? PRAMS_CIRCUMSTANCES.filter((c) => selectedGroup.circumstanceIds.includes(c.id)).map((c) => c.label)
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-brand-100 ring-1 ring-inset ring-brand/30" />
          <span className="font-medium text-ink-800">Shared announcement</span>
          <span className="text-text-muted">— same recording used across circumstances</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-surface-raised ring-1 ring-inset ring-border-strong" />
          <span className="font-medium text-ink-800">Circumstance-specific</span>
          <span className="text-text-muted">— its own recording</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 border-b border-border bg-surface-raised px-4 py-3 text-left text-xs font-medium tracking-wide text-text-muted uppercase">
                Phase
              </th>
              {PRAMS_CIRCUMSTANCES.map((c) => (
                <th
                  key={c.id}
                  className="border-b border-l border-border-subtle bg-surface-raised px-4 py-3 text-left text-xs font-semibold text-ink-900"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const runs = getSectionRuns(section, PRAMS_CIRCUMSTANCES);
              const codeCount = new Map<string, number>();
              for (const group of section.groups) {
                codeCount.set(
                  group.announcement.code,
                  (codeCount.get(group.announcement.code) ?? 0) + group.circumstanceIds.length,
                );
              }

              return (
                <tr key={section.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-border-subtle bg-surface-raised px-4 py-3 text-left align-top font-medium text-ink-900"
                  >
                    {section.name}
                  </th>
                  {runs.map((run) => {
                    const shared = (codeCount.get(run.announcement.code) ?? 0) > 1;
                    const isSelected =
                      selection?.sectionId === section.id && selection?.code === run.announcement.code;
                    return (
                      <td
                        key={run.startIndex}
                        colSpan={run.span}
                        className="border-b border-l border-border-subtle p-1.5 align-top"
                      >
                        <button
                          type="button"
                          onClick={() => setSelection({ sectionId: section.id, code: run.announcement.code })}
                          className={cn(
                            "w-full rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            isSelected
                              ? "bg-brand text-white"
                              : shared
                                ? "bg-brand-100/50 hover:bg-brand-100"
                                : "hover:bg-ink-100",
                          )}
                        >
                          <span
                            className={cn(
                              "block font-mono text-[11px]",
                              isSelected ? "text-white/80" : "text-text-muted",
                            )}
                          >
                            {run.announcement.code}
                          </span>
                          <span className="block text-[13px] leading-snug font-medium">
                            {run.announcement.title}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selection && selectedSection && selectedGroup && (
        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-medium tracking-wide text-brand uppercase">
                {selectedGroup.announcement.code} · {selectedSection.name}
              </p>
              <p className="mt-1 text-sm font-medium text-ink-900">{selectedGroup.announcement.title}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {selectedCircumstanceLabels.length === PRAMS_CIRCUMSTANCES.length
                  ? "Used for every circumstance — editing this updates all of them."
                  : `Used for: ${selectedCircumstanceLabels.join(", ")}. Editing this updates ${selectedCircumstanceLabels.length > 1 ? "all of them" : "only this one"} — other circumstances are unaffected.`}
              </p>
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

          <Textarea
            value={selectedGroup.announcement.body}
            onChange={(e) => updateAnnouncementBody(selectedGroup.announcement.code, e.target.value)}
            rows={4}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}
