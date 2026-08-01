"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Loader2, PlusCircle } from "lucide-react";
import { Panel } from "@/components/layout/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORG_TYPE_OPTIONS } from "@/components/organisations/organisation-picker";
import { createOrganisation, setOrganisationActive, updateOrganisation, type CreateOrganisationState } from "@/lib/admin/actions";
import type { Database } from "@/lib/supabase/database.types";

type OrgRow = Database["public"]["Tables"]["organisations"]["Row"];
type OrgType = Database["public"]["Enums"]["organisation_type"];

const ORG_TYPE_LABEL: Record<OrgType, string> = {
  ima: "IMA",
  jet2: "Client",
  studio: "Recording studio",
};

const createOrgInitialState: CreateOrganisationState = {};

function CreateOrganisationForm({ onCreated }: { onCreated: (org: OrgRow) => void }) {
  const [state, formAction, pending] = useActionState(createOrganisation, createOrgInitialState);
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("jet2");
  const lastHandledId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.createdId || state.createdId === lastHandledId.current) return;
    lastHandledId.current = state.createdId;
    onCreated({ id: state.createdId, name, type, is_active: true, created_at: new Date().toISOString() });
    setName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdId]);

  return (
    <form
      action={(formData) => {
        formData.set("name", name);
        formData.set("type", type);
        formAction(formData);
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
    >
      <div className="space-y-1.5">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-type">Type</Label>
        <Select value={type} onValueChange={(v) => v && setType(v as OrgType)}>
          <SelectTrigger id="org-type">
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
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <PlusCircle className="size-3.5" />}
          Create
        </Button>
      </div>
      {state.error && (
        <p className="sm:col-span-3 rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>
      )}
    </form>
  );
}

function OrganisationRow({ org, onChanged }: { org: OrgRow; onChanged: (org: OrgRow) => void }) {
  const [name, setName] = useState(org.name);
  const [type, setType] = useState<OrgType>(org.type);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function saveDetails(nextName: string, nextType: OrgType) {
    startTransition(async () => {
      const result = await updateOrganisation(org.id, nextName, nextType);
      if (result.error) setError(result.error);
      else {
        setError(null);
        onChanged({ ...org, name: nextName, type: nextType });
      }
    });
  }

  return (
    <TableRow className={!org.is_active ? "opacity-60" : undefined}>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== org.name && saveDetails(name.trim(), type)}
          className="h-8 w-48 text-sm"
          aria-label={`Name for ${org.name}`}
        />
        {error && <p className="mt-1 text-xs text-important">{error}</p>}
      </TableCell>
      <TableCell>
        <Select
          value={type}
          onValueChange={(v) => {
            if (!v) return;
            setType(v as OrgType);
            saveDetails(name, v as OrgType);
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs" aria-label={`Type for ${org.name}`}>
            <SelectValue>{ORG_TYPE_LABEL[type]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ORG_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {org.is_active ? (
          <Badge variant="outline" className="gap-1 border-emerald-300/50 text-[10px] text-emerald-700">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-text-muted">
            Archived
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setOrganisationActive(org.id, !org.is_active);
              if (result.error) setError(result.error);
              else onChanged({ ...org, is_active: !org.is_active });
            })
          }
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : org.is_active ? (
            <Archive className="size-3.5" />
          ) : (
            <ArchiveRestore className="size-3.5" />
          )}
          {org.is_active ? "Archive" : "Reactivate"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function OrganisationsPanel({ organisations }: { organisations: OrgRow[] }) {
  const [rows, setRows] = useState(organisations);

  return (
    <Panel
      title="Organisations"
      description={`${rows.length} ${rows.length === 1 ? "organisation" : "organisations"} — IMA, clients, and recording studios.`}
    >
      <div className="mb-5">
        <CreateOrganisationForm onCreated={(org) => setRows((prev) => [...prev, org])} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((org) => (
            <OrganisationRow
              key={org.id}
              org={org}
              onChanged={(updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
            />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
