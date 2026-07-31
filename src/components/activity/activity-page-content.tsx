"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { activityVerb } from "@/lib/activity/labels";
import type { ActivityFilterOptions, GlobalActivityEvent } from "@/lib/activity/queries";

const ALL = "all";

export function ActivityPageContent({
  events,
  filterOptions,
}: {
  events: GlobalActivityEvent[];
  filterOptions: ActivityFilterOptions;
}) {
  const [projectId, setProjectId] = useState(ALL);
  const [actorId, setActorId] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const actorNameById = useMemo(() => new Map(filterOptions.actors.map((a) => [a.id, a.name])), [filterOptions]);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (projectId !== ALL && event.projectId !== projectId) return false;
      if (actorId !== ALL && event.actorUserId !== actorId) return false;
      if (action !== ALL && event.action !== action) return false;
      if (dateFrom && event.createdAt < dateFrom) return false;
      if (dateTo && event.createdAt > `${dateTo}T23:59:59`) return false;
      return true;
    });
  }, [events, projectId, actorId, action, dateFrom, dateTo]);

  const hasFilters = projectId !== ALL || actorId !== ALL || action !== ALL || !!dateFrom || !!dateTo;

  function clearFilters() {
    setProjectId(ALL);
    setActorId(ALL);
    setAction(ALL);
    setDateFrom("");
    setDateTo("");
  }

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Activity"
        description="A complete, readable history of everything that's happened across your projects."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <Label className="mb-1.5 text-xs text-text-muted">Project</Label>
          <Select value={projectId} onValueChange={(v) => setProjectId(v ?? ALL)}>
            <SelectTrigger className="w-48" aria-label="Filter by project">
              <SelectValue>
                {(value: string) => (value === ALL ? "All projects" : filterOptions.projects.find((p) => p.id === value)?.name ?? value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {filterOptions.projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 text-xs text-text-muted">Person</Label>
          <Select value={actorId} onValueChange={(v) => setActorId(v ?? ALL)}>
            <SelectTrigger className="w-44" aria-label="Filter by person">
              <SelectValue>
                {(value: string) => (value === ALL ? "Everyone" : actorNameById.get(value) ?? value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {filterOptions.actors.map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>
                  {actor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 text-xs text-text-muted">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v ?? ALL)}>
            <SelectTrigger className="w-48" aria-label="Filter by action">
              <SelectValue>{(value: string) => (value === ALL ? "All actions" : activityVerb(value))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {filterOptions.actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {activityVerb(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1.5 text-xs text-text-muted">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>

        <div>
          <Label className="mb-1.5 text-xs text-text-muted">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <Panel title="Recent activity" description={`${filtered.length} of ${events.length} events`}>
        <ActivityFeed
          events={filtered.map((e) => ({ ...e, subtitle: e.projectName || undefined }))}
          emptyDescription={
            hasFilters
              ? "No activity matches these filters — try widening your search."
              : "Every upload, comment, and decision across your projects will build a history here."
          }
        />
      </Panel>
    </>
  );
}
