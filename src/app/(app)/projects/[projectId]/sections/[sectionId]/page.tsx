import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PramsMatrix } from "@/components/prams/prams-matrix";
import { AnnouncementVariantRow } from "@/components/prams/announcement-variant-row";
import { getProjectById } from "@/lib/mock/queries";
import { BOARDING_PHASE } from "@/lib/mock/prams";
import { PRAMS_SECTIONS, getPramsSectionSummary, searchPramsVariants } from "@/lib/mock/prams-library";

export default async function PramsSectionPage({
  params,
}: {
  params: Promise<{ projectId: string; sectionId: string }>;
}) {
  const { projectId, sectionId } = await params;
  const project = getProjectById(projectId);
  if (!project || project.type !== "prams") notFound();

  const section = PRAMS_SECTIONS.find((s) => s.id === sectionId);
  if (!section) notFound();

  if (section.available && section.id === "boarding") {
    return (
      <PageContainer width="wide">
        <PramsMatrix phase={BOARDING_PHASE} backHref={`/projects/${projectId}`} backLabel={project.name} />
      </PageContainer>
    );
  }

  const summary = getPramsSectionSummary(section.id);
  const variants = searchPramsVariants({ sectionId: section.id });

  return (
    <PageContainer width="wide">
      <div className="space-y-6">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary"
        >
          <ChevronLeft className="size-3.5" />
          {project.name}
        </Link>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary uppercase">{section.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
            <span>{summary.variantCount} announcement variants</span>
            <span className="text-ink-300">·</span>
            <span>{summary.recordingProgress}% recorded</span>
            {summary.needsAttention > 0 && (
              <>
                <span className="text-ink-300">·</span>
                <span className="text-important">{summary.needsAttention} need attention</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border-strong bg-surface-raised px-6 py-8 text-center">
          <p className="text-sm font-medium text-text-primary">Script matrix not yet available</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-text-muted">
            {`${section.name} hasn't been transcribed from the source PRAMS workbook in this prototype yet — only Boarding has. Its announcement variants below can still receive audio, review and approval independently.`}
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {variants.map((variant) => (
              <AnnouncementVariantRow key={variant.scriptId} projectId={projectId} variant={variant} />
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
