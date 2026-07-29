import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { AnnouncementBrowser } from "@/components/prams/announcement-browser";
import { getProjectById } from "@/lib/mock/queries";

export default async function PramsAnnouncementsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProjectById(projectId);
  if (!project || project.type !== "prams") notFound();

  return (
    <PageContainer width="wide">
      <Link
        href={`/projects/${projectId}`}
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-ink-900"
      >
        <ChevronLeft className="size-3.5" />
        {project.name}
      </Link>
      <PageHeader
        eyebrow="PRAMS"
        title="All announcements"
        description="Search and filter every announcement variant in this update without opening each one."
      />
      <Suspense fallback={null}>
        <AnnouncementBrowser projectId={projectId} />
      </Suspense>
    </PageContainer>
  );
}
