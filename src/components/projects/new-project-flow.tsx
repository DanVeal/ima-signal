"use client";

import { useActionState, useState } from "react";
import { ListTree, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrganisationPicker } from "@/components/organisations/organisation-picker";
import { cn } from "@/lib/utils";
import { createProject, type CreateProjectState } from "@/lib/projects/actions";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectType } from "@/types/domain";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type OrgRow = Database["public"]["Tables"]["organisations"]["Row"];

const TYPE_OPTIONS: {
  value: ProjectType;
  label: string;
  icon: typeof Radio;
  description: string;
  hierarchy: string;
}[] = [
  {
    value: "standard_radio",
    label: "Standard Radio",
    icon: Radio,
    description: "A conventional radio campaign — scripts, variants, recordings, review and approval.",
    hierarchy: "Project → Scripts / Variants → Audio versions → Review → Approval",
  },
  {
    value: "prams",
    label: "PRAMS",
    icon: ListTree,
    description:
      "One complete PRAMS update — every onboard announcement section and variant for this update cycle.",
    hierarchy: "Project → Update → Announcement sections → Announcement variants → Review → Approval",
  },
];

const createProjectInitialState: CreateProjectState = {};

export function NewProjectFlow({
  campaigns,
  organisations,
  canCreateOrganisations,
}: {
  campaigns: CampaignRow[];
  organisations: OrgRow[];
  canCreateOrganisations: boolean;
}) {
  const [type, setType] = useState<ProjectType | null>(null);
  const [campaignMode, setCampaignMode] = useState<"existing" | "new">(campaigns.length > 0 ? "existing" : "new");
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);
  const [state, formAction, pending] = useActionState(createProject, createProjectInitialState);

  const clientOrganisations = organisations.filter((o) => o.type !== "studio");
  const studioOrganisations = organisations.filter((o) => o.type === "studio");

  if (!type) {
    return (
      <div className="space-y-5">
        <p className="text-sm font-medium text-text-primary">What kind of project is this?</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className="group flex flex-col gap-3 rounded-xl border border-border-strong/60 bg-surface p-5 text-left transition-colors hover:border-brand/50 hover:bg-brand-100/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand">
                  <Icon className="size-4.5" strokeWidth={2} />
                </span>
                <span className="text-[15px] font-semibold text-text-primary">{option.label}</span>
                <span className="text-sm text-text-secondary">{option.description}</span>
                <span className="mt-1 font-mono text-[11px] text-text-muted">{option.hierarchy}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const selected = TYPE_OPTIONS.find((o) => o.value === type)!;

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <button
        type="button"
        onClick={() => setType(null)}
        className="text-xs font-medium text-text-muted hover:text-text-primary"
      >
        ← Change project type
      </button>

      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
          selected.value === "prams" ? "bg-signal-100 text-signal-600" : "bg-brand-100 text-brand",
        )}
      >
        <selected.icon className="size-4" strokeWidth={2.25} />
        {selected.label}
      </div>
      <input type="hidden" name="type" value={selected.value} />

      <div className="space-y-1.5">
        <Label htmlFor="new-project-name">Project name</Label>
        <Input
          id="new-project-name"
          name="name"
          required
          placeholder={selected.value === "prams" ? "PRAMS — August 2026 Update" : "Summer Sale — Wave 3"}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-project-job-number">Job number</Label>
        <Input id="new-project-job-number" name="jobNumber" required placeholder="JET2-0421" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-project-description">Brief description</Label>
        <Textarea
          id="new-project-description"
          name="description"
          rows={3}
          placeholder="What is this project for?"
        />
      </div>

      <div className="space-y-2">
        <Label>Campaign</Label>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={campaignMode === "existing" ? "default" : "outline"}
            onClick={() => setCampaignMode("existing")}
            disabled={campaigns.length === 0}
          >
            Existing campaign
          </Button>
          <Button
            type="button"
            size="sm"
            variant={campaignMode === "new" ? "default" : "outline"}
            onClick={() => setCampaignMode("new")}
          >
            New campaign
          </Button>
        </div>
        <input type="hidden" name="campaignMode" value={campaignMode} />

        {campaignMode === "existing" ? (
          <Select name="campaignId" value={campaignId} onValueChange={(v) => v && setCampaignId(v)} required>
            <SelectTrigger id="new-project-campaign">
              <SelectValue placeholder="Select a campaign">
                {campaigns.find((c) => c.id === campaignId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-2">
            <Input name="newCampaignName" required placeholder="New campaign name" />
            <OrganisationPicker
              name="newCampaignOrganisationId"
              organisations={clientOrganisations}
              canCreate={canCreateOrganisations}
              typeFilter={["jet2", "ima"]}
              triggerId="new-project-campaign-org"
              placeholder="Which client is this for?"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-project-studio">Recording studio (optional)</Label>
        <OrganisationPicker
          name="studioOrganisationId"
          organisations={studioOrganisations}
          canCreate={canCreateOrganisations}
          required={false}
          typeFilter={["studio"]}
          triggerId="new-project-studio"
          placeholder="Not assigned yet"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-project-recording-deadline">Recording deadline (optional)</Label>
          <Input id="new-project-recording-deadline" name="recordingDeadline" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-project-internal-review-deadline">Internal review (optional)</Label>
          <Input id="new-project-internal-review-deadline" name="internalReviewDeadline" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-project-client-review-deadline">Client review (optional)</Label>
          <Input id="new-project-client-review-deadline" name="clientReviewDeadline" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-project-live-date">Live date (optional)</Label>
          <Input id="new-project-live-date" name="liveDate" type="date" />
        </div>
      </div>

      {state.error && (
        <p className="rounded-md bg-important-100 px-3 py-2 text-sm text-important">{state.error}</p>
      )}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
