import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PramsVariantStatusBadge } from "@/components/status/prams-variant-status-badge";
import type { PramsVariantSummary } from "@/lib/mock/prams-library";

export function AnnouncementVariantRow({
  projectId,
  variant,
  sectionName,
}: {
  projectId: string;
  variant: PramsVariantSummary;
  /** Shown when the row appears outside its own section (e.g. the all-announcements browser). */
  sectionName?: string;
}) {
  return (
    <Link
      href={`/projects/${projectId}/audio/${variant.audioItemId}`}
      className="group flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">{variant.fullReference}</p>
          {variant.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-text-muted uppercase"
            >
              {tag}
            </span>
          ))}
        </div>
        {sectionName && <p className="mt-0.5 truncate text-xs text-text-muted">{sectionName}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-text-muted">
          {variant.versionCount === 0
            ? "No audio"
            : `${variant.versionCount} audio version${variant.versionCount === 1 ? "" : "s"}`}
        </span>
        <PramsVariantStatusBadge status={variant.status} />
        <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
