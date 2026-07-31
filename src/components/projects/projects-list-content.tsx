"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FolderClosed, Plus } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/states/empty-state";
import { Section } from "@/components/nav/page-container";
import { ProjectCard } from "@/components/projects/project-card";
import { usePinnedProjects } from "@/lib/productivity/project-marks";
import type { ProjectListRow } from "@/lib/projects/queries";
import type { Database } from "@/lib/supabase/database.types";

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type ProjectType = Database["public"]["Enums"]["project_type"];

const STATUS_OPTIONS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft_script", label: "Draft script" },
  { value: "ready_to_record", label: "Ready to record" },
  { value: "studio_recording", label: "Studio recording" },
  { value: "ready_for_ima_review", label: "Ready for IMA review" },
  { value: "ima_changes_requested", label: "IMA changes requested" },
  { value: "ready_for_jet2_review", label: "Ready for Jet2 review" },
  { value: "jet2_changes_requested", label: "Jet2 changes requested" },
  { value: "approved", label: "Approved" },
  { value: "delivered", label: "Delivered" },
];

const TYPE_OPTIONS: { value: ProjectType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "standard_radio", label: "Standard Radio" },
  { value: "prams", label: "PRAMS" },
];

export function ProjectsListContent({ projects }: { projects: ProjectListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [type, setType] = useState<ProjectType | "all">("all");
  const pinned = usePinnedProjects();
  const pinnedProjects = useMemo(
    () => projects.filter((project) => pinned.ids.includes(project.id)),
    [projects, pinned.ids],
  );

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const matchesQuery =
        query.trim().length === 0 ||
        [project.name, project.jobNumber, project.campaignName ?? ""].some((field) =>
          field.toLowerCase().includes(query.trim().toLowerCase()),
        );
      const matchesStatus = status === "all" || project.status === status;
      const matchesType = type === "all" || project.type === type;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [projects, query, status, type]);

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Every production, in one place"
        actions={
          <Button render={<Link href="/projects/new" />}>
            <Plus className="size-3.5" />
            New project
          </Button>
        }
      />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, campaigns, job numbers…"
            className="h-12 rounded-xl border-border-strong/60 pl-11 text-[15px] shadow-xs"
            aria-label="Search projects"
          />
        </div>
        <Select value={type} onValueChange={(v) => setType(v as ProjectType | "all")}>
          <SelectTrigger className="h-12 rounded-xl sm:w-48" aria-label="Filter by project type">
            <SelectValue>
              {(value: ProjectType | "all") => TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus | "all")}>
          <SelectTrigger className="h-12 rounded-xl sm:w-56" aria-label="Filter by status">
            <SelectValue>
              {(value: ProjectStatus | "all") =>
                STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pinnedProjects.length > 0 && (
        <Section title="Pinned" className="mb-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pinnedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </Section>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderClosed}
          title="No projects match your filters"
          description="Try clearing the search or status filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
