import { notFound } from "next/navigation";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { AudioPlayer } from "@/components/audio/audio-player";
import { RealAudioPlaybackProvider } from "@/lib/audio-playback-context";
import { VersionHistory } from "@/components/recordings/version-history";
import { createClient } from "@/lib/supabase/server";
import { getAudioItemDetail, getUploaderNames } from "@/lib/audio/queries";
import { getPlaybackUrl } from "@/lib/audio-upload/actions";

export const dynamic = "force-dynamic";

export default async function RecordingDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; audioItemId: string }>;
}) {
  const { projectId, audioItemId } = await params;
  const supabase = await createClient();

  const detail = await getAudioItemDetail(supabase, audioItemId).catch(() => null);
  if (!detail || detail.projectId !== projectId) notFound();

  const currentVersion = detail.versions.find((v) => v.id === detail.currentVersionId) ?? null;
  const uploaders = await getUploaderNames(supabase, detail.versions.map((v) => v.uploadedByUserId));
  const playbackUrl = currentVersion ? await getPlaybackUrl(currentVersion.storagePath) : null;

  return (
    <PageContainer>
      <PageHeader eyebrow="Recording · Phase 2C.1" title={detail.label} />

      {currentVersion && playbackUrl ? (
        <Section title="Playback" className="mb-10">
          <RealAudioPlaybackProvider key={currentVersion.id} src={playbackUrl}>
            <AudioPlayer seed={detail.audioItemId} peaks={currentVersion.waveformPeaks} />
          </RealAudioPlaybackProvider>
        </Section>
      ) : (
        <Section title="Playback" className="mb-10">
          <p className="text-sm text-text-muted">No recording uploaded yet.</p>
        </Section>
      )}

      <Section
        title="Version history"
        description="Every uploaded version, oldest to newest — nothing is ever deleted. Restoring an older version creates a new one; it never rewrites history."
      >
        <VersionHistory versions={detail.versions} currentVersionId={detail.currentVersionId} uploaders={uploaders} />
      </Section>
    </PageContainer>
  );
}
