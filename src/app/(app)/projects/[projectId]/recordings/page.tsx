import Link from "next/link";
import { notFound } from "next/navigation";
import { Mic, UploadCloud } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/nav/page-container";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaticWaveform } from "@/components/audio/static-waveform";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/supabase/repository";
import { getRecordingsForProject, getUploaderNames } from "@/lib/audio/queries";
import { formatDateTime, formatDuration, formatFileSize } from "@/lib/format";

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
  const uploaders = await getUploaderNames(supabase, uploaderIds);

  const withAudio = rows.filter((r) => r.currentVersion);
  const missing = rows.filter((r) => !r.currentVersion);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Recordings · Phase 2C.1"
        title={project.name}
        description={`${withAudio.length} of ${rows.length} ${project.type === "prams" ? "announcement variants" : "script variants"} have a recording. ${missing.length} missing.`}
        actions={
          <Button render={<Link href={`/projects/${projectId}/recordings/upload`} />}>
            <UploadCloud className="size-4" />
            Upload recordings
          </Button>
        }
      />

      <Section title="Recordings" description="Current version shown per variant/reference — full history on each recording's page.">
        <div className="space-y-2">
          {rows.map((row) => {
            const v = row.currentVersion;
            const uploader = v?.uploadedByUserId ? uploaders.get(v.uploadedByUserId) : undefined;
            return (
              <Link
                key={row.subjectId}
                href={row.audioItemId ? `/projects/${projectId}/recordings/${row.audioItemId}` : "#"}
                className={`group flex items-center gap-4 rounded-lg border border-border bg-surface-raised px-4 py-3 transition-colors ${
                  row.audioItemId ? "hover:border-brand/40 hover:bg-brand-100/10" : "cursor-default opacity-70"
                }`}
                aria-disabled={!row.audioItemId}
              >
                <div className="w-36 shrink-0">
                  <p className="truncate text-sm font-medium text-ink-900">{row.code}</p>
                  <p className="truncate text-xs text-text-muted">{row.label.replace(`${row.code} — `, "")}</p>
                </div>

                <div className="min-w-0 flex-1">
                  {v ? (
                    <StaticWaveform
                      peaks={v.waveformPeaks}
                      barClassName="bg-ink-300 group-hover:bg-brand/60 transition-colors"
                    />
                  ) : (
                    <div className="flex h-8 items-center gap-2 text-xs text-text-muted">
                      <Mic className="size-3.5" />
                      No recording yet
                    </div>
                  )}
                </div>

                {v && (
                  <>
                    <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-text-secondary">
                      {v.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      v{v.versionNumber}
                    </Badge>
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      {uploader && (
                        <Avatar className="size-6">
                          <AvatarFallback className="bg-ink-100 text-[10px] font-medium text-ink-700">
                            {uploader.avatarInitials}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs text-text-secondary">{uploader?.fullName ?? "Unknown"}</p>
                        <p className="truncate text-[11px] text-text-muted">
                          {formatDateTime(v.createdAt)} · {formatFileSize(v.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </Section>
    </PageContainer>
  );
}
