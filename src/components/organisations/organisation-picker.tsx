"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrganisation } from "@/lib/admin/actions";
import type { Database } from "@/lib/supabase/database.types";

type OrgRow = Database["public"]["Tables"]["organisations"]["Row"];
type OrgType = Database["public"]["Enums"]["organisation_type"];

export const ORG_TYPE_OPTIONS: { value: OrgType; label: string }[] = [
  { value: "ima", label: "IMA" },
  { value: "jet2", label: "Client" },
  { value: "studio", label: "Recording studio" },
];

/**
 * A "pick an organisation" select that lets an IMA Admin create a new one
 * inline (name + type) without leaving the surrounding form — used from
 * both the Admin area's create-user panel and the new-project flow's
 * client/studio pickers.
 */
export function OrganisationPicker({
  name,
  organisations,
  canCreate,
  required = true,
  typeFilter,
  placeholder = "Select an organisation",
  triggerId,
}: {
  name: string;
  organisations: OrgRow[];
  canCreate: boolean;
  required?: boolean;
  typeFilter?: OrgType[];
  placeholder?: string;
  triggerId?: string;
}) {
  const [options, setOptions] = useState(organisations);
  const [value, setValue] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<OrgType>(typeFilter?.[0] ?? "jet2");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = typeFilter ? options.filter((o) => typeFilter.includes(o.type)) : options;

  if (creating) {
    return (
      <div className="space-y-2 rounded-md border border-border-subtle p-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Organisation name"
          autoFocus
        />
        <Select value={newType} onValueChange={(v) => v && setNewType(v as OrgType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORG_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-important">{error}</p>}
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={pending || !newName.trim()}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("name", newName.trim());
                fd.set("type", newType);
                const result = await createOrganisation({}, fd);
                if (result.error || !result.createdId) {
                  setError(result.error ?? "Couldn't create the organisation.");
                  return;
                }
                const created: OrgRow = {
                  id: result.createdId,
                  name: newName.trim(),
                  type: newType,
                  is_active: true,
                  created_at: new Date().toISOString(),
                };
                setOptions((prev) => [...prev, created]);
                setValue(created.id);
                setCreating(false);
                setNewName("");
                setError(null);
              })
            }
          >
            {pending ? "Creating…" : "Create"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Select name={name} value={value} onValueChange={(v) => v && setValue(v)} required={required}>
        <SelectTrigger id={triggerId}>
          <SelectValue placeholder={placeholder}>
            {options.find((o) => o.id === value)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {filtered.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canCreate && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          <Plus className="size-3" />
          New organisation
        </button>
      )}
    </div>
  );
}
