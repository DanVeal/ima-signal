import { notFound } from "next/navigation";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { UploadWorkflow } from "@/components/recordings/upload-workflow";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/supabase/repository";
import { getMatchTargetsForProject } from "@/lib/audio-upload/actions";

export const dynamic = "force-dynamic";

/**
 * Bulk upload workflow: drag-and-drop or browse, real-time filename
 * matching against this project's variants/announcement references,
 * a preview the user must explicitly approve, then a concurrency-capped
 * upload with real per-file progress. Nothing uploads until "Import" is
 * clicked — see docs/audio-foundation.md.
 */
export default async function RecordingsUploadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) notFound();

  const targets = await getMatchTargetsForProject(projectId);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Recordings"
        title={`Upload recordings — ${project.name}`}
        description="Filenames are matched exactly, case-insensitively, whitespace-insensitively, and by reference-code substring — review the match before anything is imported."
      />
      <Section title="Upload">
        <UploadWorkflow targets={targets} />
      </Section>
    </PageContainer>
  );
}
