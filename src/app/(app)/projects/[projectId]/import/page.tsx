import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { PramsImportWorkflow } from "@/components/prams/prams-import-workflow";
import { getProjectById } from "@/lib/mock/queries";

export default async function PramsImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = getProjectById(projectId);
  if (!project || project.type !== "prams") notFound();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="PRAMS"
        title="Import workbook &amp; audio"
        description="Bring in an updated PRAMS workbook and bulk-upload the recordings for it."
      />
      <PramsImportWorkflow projectId={projectId} />
    </PageContainer>
  );
}
