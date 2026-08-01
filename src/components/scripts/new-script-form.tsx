"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createScript, type CreateScriptState } from "@/lib/scripts/actions";

const initialState: CreateScriptState = {};

interface AltDraft {
  key: string;
  label: string;
  body: string;
}

function emptyVariant() {
  return { key: crypto.randomUUID() };
}

export function NewScriptForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createScript, initialState);
  const [variants, setVariants] = useState([emptyVariant()]);
  const [anchorByVariant, setAnchorByVariant] = useState<Record<string, string>>({});
  const [altsByVariant, setAltsByVariant] = useState<Record<string, AltDraft[]>>({});

  function addAlt(variantKey: string) {
    setAltsByVariant((prev) => {
      const existing = prev[variantKey] ?? [];
      return {
        ...prev,
        [variantKey]: [...existing, { key: crypto.randomUUID(), label: `ALT ${existing.length + 1}`, body: "" }],
      };
    });
  }

  function updateAlt(variantKey: string, altKey: string, field: "label" | "body", value: string) {
    setAltsByVariant((prev) => ({
      ...prev,
      [variantKey]: (prev[variantKey] ?? []).map((alt) => (alt.key === altKey ? { ...alt, [field]: value } : alt)),
    }));
  }

  function removeAlt(variantKey: string, altKey: string) {
    setAltsByVariant((prev) => ({
      ...prev,
      [variantKey]: (prev[variantKey] ?? []).filter((alt) => alt.key !== altKey),
    }));
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="space-y-1.5">
        <Label htmlFor="script-title">Script title</Label>
        <Input id="script-title" name="title" required placeholder="e.g. Winter Sun VO" />
      </div>

      <div className="space-y-4">
        <Label>Variants</Label>
        {variants.map((variant, index) => {
          const alts = altsByVariant[variant.key] ?? [];
          return (
            <div key={variant.key} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-wide text-text-muted uppercase">Variant {index + 1}</p>
                {variants.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove variant ${index + 1}`}
                    onClick={() => setVariants((prev) => prev.filter((v) => v.key !== variant.key))}
                    className="text-text-muted hover:text-critical"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor={`variant-code-${variant.key}`} className="text-xs">
                    Variant code
                  </Label>
                  <Input id={`variant-code-${variant.key}`} name="variantCode" required placeholder="MAN-TFS" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`departure-${variant.key}`} className="text-xs">
                    Departure airport
                  </Label>
                  <Input id={`departure-${variant.key}`} name="departureAirport" placeholder="Manchester" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`destination-${variant.key}`} className="text-xs">
                    Destination
                  </Label>
                  <Input id={`destination-${variant.key}`} name="destination" placeholder="Tenerife" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`offer-${variant.key}`} className="text-xs">
                    Offer label
                  </Label>
                  <Input id={`offer-${variant.key}`} name="offerLabel" placeholder="Optional" />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`lines-${variant.key}`} className="text-xs">
                  Script lines (one per line)
                </Label>
                <Textarea id={`lines-${variant.key}`} name="lines" rows={5} placeholder={"Line one...\nLine two..."} />
              </div>

              <div className="space-y-2 rounded-md border border-dashed border-border-strong p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Alternate lines (optional)</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => addAlt(variant.key)}>
                    <Plus className="size-3.5" />
                    Add alternate
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  For a base script with optional swap-in lines (e.g. &quot;ALT 1 to go after the KSP line&quot;) —
                  never a full separate variant. At most one alternate is used in any given recording.
                </p>

                {alts.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor={`anchor-${variant.key}`} className="text-xs">
                      Insert alternates after line #
                    </Label>
                    <Input
                      id={`anchor-${variant.key}`}
                      name="anchorLine"
                      type="number"
                      min={1}
                      className="max-w-24"
                      value={anchorByVariant[variant.key] ?? ""}
                      onChange={(e) => setAnchorByVariant((prev) => ({ ...prev, [variant.key]: e.target.value }))}
                    />
                  </div>
                )}
                {alts.length === 0 && <input type="hidden" name="anchorLine" value="" />}

                {alts.map((alt) => (
                  <div key={alt.key} className="flex items-start gap-2 rounded-md bg-surface-raised p-2">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={alt.label}
                        onChange={(e) => updateAlt(variant.key, alt.key, "label", e.target.value)}
                        className="h-7 max-w-40 text-xs"
                        placeholder="ALT 1"
                      />
                      <Textarea
                        value={alt.body}
                        onChange={(e) => updateAlt(variant.key, alt.key, "body", e.target.value)}
                        rows={2}
                        placeholder="Plus, save up to £400 for a family of four!"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Remove alternate"
                      onClick={() => removeAlt(variant.key, alt.key)}
                      className="mt-1 text-text-muted hover:text-critical"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <input type="hidden" name="alts" value={JSON.stringify(alts.map(({ label, body }) => ({ label, body })))} />
              </div>

              <input type="hidden" name="regionLabel" value="" />
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={() => setVariants((prev) => [...prev, emptyVariant()])}>
          <Plus className="size-3.5" />
          Add another variant
        </Button>
      </div>

      {state.error && <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? "Creating…" : "Create script"}
      </Button>
    </form>
  );
}
