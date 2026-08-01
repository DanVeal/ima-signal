import Link from "next/link";
import { notFound } from "next/navigation";
import { ListTree, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { ProjectStatusBadge } from "@/components/status/project-status-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { RealProjectMeta } from "@/components/projects/real-project-meta";
import { RealProjectSummary } from "@/components/projects/real-project-summary";
import { RealVariantList } from "@/components/projects/real-variant-list";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { RecordVisit } from "@/components/productivity/record-visit";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/projects/queries";
import { getActivityForProject } from "@/lib/activity/queries";
import { getRecordingsForProject } from "@/lib/audio/queries";
import { getPramsSectionSummary } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const project = await getProjectDetail(supabase, projectId);
  if (!project) notFound();

  const [recordings, activity, sections] = await Promise.all([
    project.type === "standard_radio" ? getRecordingsForProject(supabase, projectId) : Promise.resolve([]),
    getActivityForProject(supabase, projectId),
    project.type === "prams" ? getPramsSectionSummary(supabase, projectId) : Promise.resolve([]),
  ]);

  const secondTabLabel = project.type === "prams" ? "Sections" : "Scripts & variants";

  return (
    <PageContainer>
      <RecordVisit
        item={{ id: project.id, type: "project", label: project.name, subtitle: project.jobNumber, url: `/projects/${project.id}` }}
      />
      <PageHeader
        eyebrow={`${project.campaignName ?? project.jobNumber} · ${project.jobNumber}`}
        title={project.name}
        actions={
          <div className="flex items-center gap-2">
            {project.type === "standard_radio" && <ProjectStatusBadge status={project.status} />}
            {project.status !== "delivered" && project.liveDate && <DeadlineBadge date={project.liveDate} />}
          </div>
        }
      />

      <div className="space-y-6">
        <RealProjectMeta project={project} />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scripts">{secondTabLabel}</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <RealProjectSummary project={project} />
          </TabsContent>
          <TabsContent value="scripts" className="mt-5">
            {project.type === "prams" ? (
              sections.length === 0 ? (
                <EmptyState
                  icon={ListTree}
                  title="No sections yet"
                  description="Sections appear here once the update's structure has been imported."
                />
              ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="divide-y divide-border-subtle">
                  {sections.map(({ section, variantCount }) => (
                    <div key={section.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{section.name}</p>
                        <p className="text-xs text-text-muted">
                          {section.available ? "Transcribed from workbook" : "Structure only — not yet transcribed"}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums text-text-secondary">
                        {variantCount} variant{variantCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )
            ) : (
              <div className="space-y-4">
                {recordings.length > 0 && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" render={<Link href={`/projects/${project.id}/scripts/new`} />}>
                      <Plus className="size-3.5" />
                      New script
                    </Button>
                  </div>
                )}
                <RealVariantList projectId={project.id} rows={recordings} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="activity" className="mt-5">
            <ActivityFeed
              events={activity}
              emptyDescription="Actions taken on this project will build a full, readable history here."
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
