"use client";

import { useState } from "react";
import { Layers, CircleDashed, Route as RouteIcon, X, type LucideIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { PramsRow, PramsSectionKind } from "@/lib/mock/prams";
import type { Script } from "@/types/domain";

const KIND_META: Record<
  PramsSectionKind,
  { label: string; icon: LucideIcon; hint: string; rowTint: string }
> = {
  shared: {
    label: "Shared",
    icon: Layers,
    hint: "Same wording across every variant — edit once, it moves everywhere.",
    rowTint: "bg-brand-100/40",
  },
  optional: {
    label: "Optional",
    icon: CircleDashed,
    hint: "Only some variants include this section.",
    rowTint: "",
  },
  variant: {
    label: "Variant-specific",
    icon: RouteIcon,
    hint: "Genuinely different wording for each variant.",
    rowTint: "",
  },
};

interface Selection {
  sectionId: string;
  scriptId: string;
}

export function PramsMatrix({ scripts, initialRows }: { scripts: Script[]; initialRows: PramsRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  const selectedRow = selection ? rows.find((r) => r.section.id === selection.sectionId) : undefined;
  const selectedCell = selectedRow?.cells[selection?.scriptId ?? ""];

  function updateSharedRow(sectionId: string, text: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.section.id !== sectionId) return row;
        const cells = { ...row.cells };
        for (const scriptId of Object.keys(cells)) {
          cells[scriptId] = { ...cells[scriptId], text };
        }
        return { ...row, cells };
      }),
    );
  }

  function updateCell(sectionId: string, scriptId: string, patch: Partial<PramsCellUpdate>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.section.id !== sectionId) return row;
        const cell = row.cells[scriptId];
        return { ...row, cells: { ...row.cells, [scriptId]: { ...cell, ...patch } } };
      }),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        {Object.entries(KIND_META).map(([kind, meta]) => (
          <div key={kind} className="flex items-center gap-1.5">
            <meta.icon className="size-3.5 text-ink-500" strokeWidth={2.25} />
            <span className="font-medium text-ink-800">{meta.label}</span>
            <span className="text-text-muted">— {meta.hint}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-48 border-b border-border bg-surface-raised px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Section
              </th>
              {scripts.map((script) => (
                <th
                  key={script.id}
                  className="border-b border-l border-border-subtle bg-surface-raised px-4 py-3 text-left align-top text-xs font-semibold text-ink-900"
                >
                  {script.title}
                  <span className="mt-0.5 block font-mono text-[10px] font-normal text-text-muted">
                    {script.variantCode}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = KIND_META[row.section.kind];
              const isHovered = hoveredSection === row.section.id;
              return (
                <tr
                  key={row.section.id}
                  onMouseEnter={() => setHoveredSection(row.section.id)}
                  onMouseLeave={() => setHoveredSection(null)}
                  className={cn("transition-colors", meta.rowTint)}
                >
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-b border-border-subtle bg-surface-raised px-4 py-3 text-left align-top font-medium text-ink-900 transition-colors",
                      isHovered && "bg-ink-100",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <meta.icon className="size-3.5 shrink-0 text-ink-500" strokeWidth={2.25} />
                      {row.section.label}
                    </span>
                  </th>
                  {scripts.map((script) => {
                    const cell = row.cells[script.id];
                    const isSelected =
                      selection?.sectionId === row.section.id && selection?.scriptId === script.id;
                    return (
                      <td
                        key={script.id}
                        className={cn(
                          "border-b border-l border-border-subtle px-4 py-3 align-top transition-colors",
                          isHovered && row.section.kind === "shared" && "bg-brand-100/70",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelection({ sectionId: row.section.id, scriptId: script.id })}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            isSelected
                              ? "bg-brand text-white"
                              : cell.included
                                ? "text-ink-800 hover:bg-ink-100"
                                : "border border-dashed border-border-strong text-text-muted italic hover:bg-ink-100",
                          )}
                        >
                          {cell.included ? cell.text : "Not included"}
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

      {selection && selectedRow && selectedCell && (
        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-brand uppercase">
                {selectedRow.section.label}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {selectedRow.section.kind === "shared" &&
                  `Editing this updates all ${scripts.length} variants — they all use identical wording here.`}
                {selectedRow.section.kind === "variant" &&
                  `This only changes ${scripts.find((s) => s.id === selection.scriptId)?.title}. Other variants are unaffected.`}
                {selectedRow.section.kind === "optional" &&
                  `Optional — toggle whether ${scripts.find((s) => s.id === selection.scriptId)?.title} includes this section.`}
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

          {selectedRow.section.kind === "optional" && (
            <label className="mb-3 flex items-center gap-2 text-sm text-ink-800">
              <Switch
                checked={selectedCell.included}
                onCheckedChange={(checked) =>
                  updateCell(selectedRow.section.id, selection.scriptId, {
                    included: checked,
                    text: checked ? selectedCell.text || "Free 22kg baggage allowance included." : "",
                  })
                }
              />
              Included in this variant
            </label>
          )}

          <Textarea
            value={selectedCell.text}
            disabled={selectedRow.section.kind === "optional" && !selectedCell.included}
            onChange={(e) => {
              if (selectedRow.section.kind === "shared") {
                updateSharedRow(selectedRow.section.id, e.target.value);
              } else {
                updateCell(selectedRow.section.id, selection.scriptId, { text: e.target.value });
              }
            }}
            rows={3}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

interface PramsCellUpdate {
  included: boolean;
  text: string;
}
