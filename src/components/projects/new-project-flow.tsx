"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListTree, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/types/domain";

const TYPE_OPTIONS: {
  value: ProjectType;
  label: string;
  icon: typeof Radio;
  description: string;
  hierarchy: string;
  demoProjectId: string;
}[] = [
  {
    value: "standard_radio",
    label: "Standard Radio",
    icon: Radio,
    description: "A conventional radio campaign — scripts, variants, recordings, review and approval.",
    hierarchy: "Project → Scripts / Variants → Audio versions → Review → Approval",
    demoProjectId: "proj-winter-sun-w1",
  },
  {
    value: "prams",
    label: "PRAMS",
    icon: ListTree,
    description:
      "One complete PRAMS update — every onboard announcement section and variant for this update cycle.",
    hierarchy: "Project → Update → Announcement sections → Announcement variants → Review → Approval",
    demoProjectId: "proj-prams-july-2026",
  },
];

export function NewProjectFlow() {
  const router = useRouter();
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
    <div className="max-w-lg space-y-5">
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

      <div className="space-y-1.5">
        <Label htmlFor="new-project-name">Project name</Label>
        <Input
          id="new-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={selected.value === "prams" ? "PRAMS — August 2026 Update" : "Summer Sale — Wave 3"}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-project-description">Brief description</Label>
        <Textarea
          id="new-project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is this project for?"
        />
      </div>

      <div className="rounded-md bg-ink-100/60 px-3 py-2 text-xs text-text-muted">
        This prototype doesn&apos;t create real projects yet — Phase 2 connects this form to Supabase.
        Continuing takes you to an example {selected.label} project so you can see where this leads.
      </div>

      <Button onClick={() => router.push(`/projects/${selected.demoProjectId}` as never)}>
        Create project
      </Button>
    </div>
  );
}
