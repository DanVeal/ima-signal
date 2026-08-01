"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createScript, type CreateScriptState } from "@/lib/scripts/actions";

const initialState: CreateScriptState = {};

function emptyVariant() {
  return { key: crypto.randomUUID() };
}

export function NewScriptForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createScript, initialState);
  const [variants, setVariants] = useState([emptyVariant()]);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="space-y-1.5">
        <Label htmlFor="script-title">Script title</Label>
        <Input id="script-title" name="title" required placeholder="e.g. Winter Sun VO" />
      </div>

      <div className="space-y-4">
        <Label>Variants</Label>
        {variants.map((variant, index) => (
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
            <input type="hidden" name="regionLabel" value="" />
          </div>
        ))}

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
