import Link from "next/link";
import { AlertTriangle, ArrowRight, Upload } from "lucide-react";
import { PageHeader, Section } from "@/components/nav/page-container";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { Button } from "@/components/ui/button";
import { SectionNavigator } from "@/components/prams/section-navigator";
import { AnnouncementVariantRow } from "@/components/prams/announcement-variant-row";
import { getPramsNeedsAttention, getPramsOverviewStats } from "@/lib/mock/prams-library";
import type { Project } from "@/types/domain";

const STAT_TILES: {
  key: keyof ReturnType<typeof getPramsOverviewStats>;
  label: string;
  filter?: string;
}[] = [
  { key: "totalVariants", label: "Announcement variants" },
  { key: "totalAudioFiles", label: "Audio files" },
  { key: "approved", label: "Approved", filter: "approved" },
  { key: "awaitingReview", label: "Awaiting review", filter: "awaiting_review" },
  { key: "changesRequested", label: "Changes requested", filter: "changes_requested" },
  { key: "missingAudio", label: "Missing audio", filter: "missing_audio" },
];

export function PramsProjectOverview({ project }: { project: Project }) {
  const stats = getPramsOverviewStats();
  const { items: attentionItems, total: attentionTotal } = getPramsNeedsAttention(6);

  return (
    <>
      <PageHeader
        eyebrow="PRAMS"
        title={project.name}
        description={project.description}
        actions={
          <div className="flex items-center gap-2">
            <DeadlineBadge date={project.liveDate} />
            <Button render={<Link href={`/projects/${project.id}/import`} />}>
              <Upload className="size-3.5" />
              Import workbook / audio
            </Button>
          </div>
        }
      />

      <div className="space-y-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_TILES.map((tile) => {
            const value = stats[tile.key];
            const content = (
              <>
                <p className="text-2xl font-semibold tabular-nums text-text-primary group-hover:text-brand">
                  {value}
                </p>
                <p className="mt-1 text-xs text-text-secondary">{tile.label}</p>
              </>
            );
            return tile.filter ? (
              <Link
                key={tile.key}
                href={`/projects/${project.id}/announcements?status=${tile.filter}`}
                className="group block"
              >
                {content}
              </Link>
            ) : (
              <div key={tile.key}>{content}</div>
            );
          })}
        </div>

        <Section
          title="Needs attention"
          description="Specific announcement variants blocking a decision or missing audio entirely."
        >
          {attentionItems.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing needs attention right now.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="divide-y divide-border-subtle">
                  {attentionItems.map((item) => (
                    <AnnouncementVariantRow
                      key={item.scriptId}
                      projectId={project.id}
                      variant={item}
                      sectionName={item.sectionName}
                    />
                  ))}
                </div>
              </div>
              {attentionTotal > attentionItems.length && (
                <Link
                  href={`/projects/${project.id}/announcements?status=changes_requested`}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  <AlertTriangle className="size-3.5" />
                  {attentionTotal - attentionItems.length} more need attention — view all
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </>
          )}
        </Section>

        <Section
          title="Announcement sections"
          description="Boarding, Safety Demonstration, After Take-off and every other section in this update."
          href={`/projects/${project.id}/announcements`}
          hrefLabel="Browse all announcements"
        >
          <SectionNavigator projectId={project.id} />
        </Section>
      </div>
    </>
  );
}
