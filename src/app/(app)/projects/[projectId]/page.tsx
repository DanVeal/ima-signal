import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { ProjectStatusBadge } from "@/components/status/project-status-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { ProjectMeta } from "@/components/projects/project-meta";
import { BriefPanel } from "@/components/projects/brief-panel";
import { VariantList } from "@/components/projects/variant-list";
import { ActivityList } from "@/components/activity/activity-list";
import { PramsMatrix } from "@/components/prams/prams-matrix";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActivityForProject, getCampaign, getProjectById } from "@/lib/mock/queries";
import { BOARDING_PHASE, UPCOMING_PHASES } from "@/lib/mock/prams";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProjectById(projectId);
  if (!project) notFound();

  const campaign = getCampaign(project.campaignId);
  const activity = getActivityForProject(project.id);

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`${campaign?.name} · ${project.jobNumber}`}
        title={project.name}
        description={project.description}
        actions={
          <div className="flex items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <DeadlineBadge date={project.liveDate} />
          </div>
        }
      />

      <div className="space-y-6">
        <ProjectMeta project={project} />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scripts">Scripts &amp; variants</TabsTrigger>
            <TabsTrigger value="prams">PRAMS Matrix</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <BriefPanel project={project} />
          </TabsContent>
          <TabsContent value="scripts" className="mt-5">
            <VariantList projectId={project.id} />
          </TabsContent>
          <TabsContent value="prams" className="mt-5">
            <PramsMatrix phase={BOARDING_PHASE} upcomingPhases={UPCOMING_PHASES} />
          </TabsContent>
          <TabsContent value="activity" className="mt-5">
            <ActivityList events={activity} />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
