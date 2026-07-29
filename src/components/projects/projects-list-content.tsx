"use client";

import { useMemo, useState } from "react";
import { Search, FolderClosed } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/states/empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { useDemoUser } from "@/lib/demo-user-context";
import { getCampaign, getOrganisation, getProjectsForOrganisation } from "@/lib/mock/queries";
import type { ProjectStatus } from "@/types/domain";

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

export function ProjectsListContent() {
  const { currentUser } = useDemoUser();
  const organisation = getOrganisation(currentUser.organisationId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");

  const projects = getProjectsForOrganisation(organisation?.type ?? "ima", currentUser.organisationId);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const campaign = getCampaign(project.campaignId);
      const matchesQuery =
        query.trim().length === 0 ||
        [project.name, project.jobNumber, campaign?.name ?? ""].some((field) =>
          field.toLowerCase().includes(query.trim().toLowerCase()),
        );
      const matchesStatus = status === "all" || project.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [projects, query, status]);

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Every radio production brief across your organisation, from first draft to delivery."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, campaigns, job numbers…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus | "all")}>
          <SelectTrigger className="sm:w-56" aria-label="Filter by status">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderClosed}
          title="No projects match your filters"
          description="Try clearing the search or status filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
