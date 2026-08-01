import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/nav/page-container";
import { RealImportWorkflow } from "@/components/prams/real-import-workflow";
import { createClient } from "@/lib/supabase/server";
import { getPramsSections, getProjectById } from "@/lib/supabase/repository";

// Requires a signed-in session (real Supabase Auth + RLS) — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function PramsImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project || project.type !== "prams") notFound();

  const sections = await getPramsSections(supabase, projectId);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="PRAMS"
        title="Import workbook"
        description={`Bring in an updated PRAMS workbook section for ${project.name}. Reviewed and confirmed before anything is applied.`}
      />
      <RealImportWorkflow projectId={projectId} sections={sections} />
    </PageContainer>
  );
}
