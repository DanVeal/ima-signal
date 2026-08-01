import Link from "next/link";
import { notFound } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { Button } from "@/components/ui/button";
import { RecordingsBrowser } from "@/components/recordings/recordings-browser";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/supabase/repository";
import { canUploadAudioForProject, getRecordingsForProject, getUploaderNames } from "@/lib/audio/queries";
import { getAiPermissions, getHealthRatingsByAudioVersionIds, getLatestAiJobsByAudioVersionIds } from "@/lib/intelligence/queries";

export const dynamic = "force-dynamic";

/**
 * Phase 2C.1 proof-of-foundation: every recording attached to this
 * project's Standard Radio variants (or PRAMS announcement versions),
 * read live from audio_items/audio_versions — real Supabase Storage
 * objects, real ffprobe/ffmpeg metadata and waveforms, no mock data.
 *
 * A new route (not a replacement for /projects/[projectId]/audio/...,
 * which is still mock-driven pending comments/approvals/QC) — see
 * docs/audio-foundation.md.
 */
export default async function RecordingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) notFound();

  const rows = await getRecordingsForProject(supabase, projectId);
  const uploaderIds = rows.map((r) => r.currentVersion?.uploadedByUserId ?? null);
  const audioVersionIds = rows.map((r) => r.currentVersion?.id).filter((id): id is string => !!id);

  const [uploaders, jobStatusByVersionId, healthByVersionId, aiPermissions, canUpload] = await Promise.all([
    getUploaderNames(supabase, uploaderIds),
    getLatestAiJobsByAudioVersionIds(supabase, audioVersionIds),
    getHealthRatingsByAudioVersionIds(supabase, audioVersionIds),
    getAiPermissions(supabase, projectId),
    canUploadAudioForProject(supabase, projectId),
  ]);

  const withAudio = rows.filter((r) => r.currentVersion);
  const missing = rows.filter((r) => !r.currentVersion);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Recordings"
        title={project.name}
        description={`${withAudio.length} of ${rows.length} ${project.type === "prams" ? "announcement variants" : "script variants"} have a recording. ${missing.length} missing.`}
        actions={
          canUpload ? (
            <Button render={<Link href={`/projects/${projectId}/recordings/upload`} />}>
              <UploadCloud className="size-4" />
              Upload recordings
            </Button>
          ) : undefined
        }
      />

      <Section
        title="Recordings"
        description="Current version shown per variant/reference — full history on each recording's page. Search, sort, filter, switch views, or select recordings to generate transcripts in bulk."
      >
        <RecordingsBrowser
          projectId={projectId}
          rows={rows}
          uploaders={uploaders}
          jobStatusByVersionId={jobStatusByVersionId}
          healthByVersionId={healthByVersionId}
          canGenerate={aiPermissions.canGenerate}
          canUpload={canUpload}
        />
      </Section>
    </PageContainer>
  );
}
