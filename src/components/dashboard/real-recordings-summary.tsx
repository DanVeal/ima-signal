import Link from "next/link";
import { Mic, UploadCloud, AlertCircle } from "lucide-react";
import { Section } from "@/components/nav/page-container";
import { StaticWaveform } from "@/components/audio/static-waveform";
import { createClient } from "@/lib/supabase/server";
import { getRecordingsDashboardStats } from "@/lib/audio/queries";
import { formatDateTime, formatDuration } from "@/lib/format";

/**
 * Phase 2C.1 proof-of-foundation: real recording counts, real uploads, real
 * missing-audio count, and the real most-recently-uploaded recordings —
 * read live from audio_items/audio_versions across every project the
 * signed-in user can access (RLS-scoped).
 *
 * A deliberately separate section from the rest of this page: the
 * headline/attention-queue/deadlines sections below still read
 * src/lib/mock/ (they depend on comments/change-requests/approvals, which
 * don't exist in the database yet — see docs/audio-foundation.md). Mixing
 * one real number into a page built entirely from mock data would be
 * misleading, not honest, so this stays a clearly-labelled section of its
 * own rather than replacing any existing number on this page.
 */
export async function RealRecordingsSummary() {
  const supabase = await createClient();
  const stats = await getRecordingsDashboardStats(supabase);

  return (
    <Section
      title="Recordings (live)"
      description="Real counts from Supabase Storage + audio_items/audio_versions — Phase 2C.1."
      className="mb-12"
    >
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile icon={Mic} label="Recordings" value={stats.totalRecordings} />
        <StatTile icon={UploadCloud} label="Total uploads" value={stats.totalUploads} />
        <StatTile icon={AlertCircle} label="Missing audio" value={stats.missingAudioCount} tone={stats.missingAudioCount > 0 ? "warning" : undefined} />
      </div>

      {stats.latest.length > 0 && (
        <div className="space-y-2">
          {stats.latest.map((v) => (
            <Link
              key={v.id}
              href={`/projects/${v.projectId}/recordings`}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface-raised px-4 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-100/10"
            >
              <div className="w-40 shrink-0">
                <p className="truncate text-sm font-medium text-ink-900">{v.label.split(" — ")[0]}</p>
                <p className="truncate text-xs text-text-muted">{v.projectName}</p>
              </div>
              <div className="min-w-0 flex-1">
                <StaticWaveform peaks={v.waveformPeaks} />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-text-secondary">
                {v.durationSeconds != null ? formatDuration(v.durationSeconds) : "—"}
              </span>
              <span className="w-32 shrink-0 text-right text-xs text-text-muted">{formatDateTime(v.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-text-muted">
        <Icon className="size-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${tone === "warning" && value > 0 ? "text-important" : "text-ink-900"}`}>
        {value}
      </p>
    </div>
  );
}
