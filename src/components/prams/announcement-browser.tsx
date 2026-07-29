"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/states/empty-state";
import { AnnouncementVariantRow } from "@/components/prams/announcement-variant-row";
import {
  PRAMS_SECTIONS,
  getPramsSectionName,
  searchPramsVariants,
  type PramsVariantStatus,
} from "@/lib/mock/prams-library";

const STATUS_OPTIONS: { value: PramsVariantStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "approved", label: "Approved" },
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "missing_audio", label: "Missing audio" },
];

const PAGE_SIZE = 25;

export function AnnouncementBrowser({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState("all");
  const [status, setStatus] = useState<PramsVariantStatus | "all">(
    (searchParams.get("status") as PramsVariantStatus | null) ?? "all",
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const results = useMemo(() => {
    return searchPramsVariants({
      query,
      sectionId: sectionId === "all" ? undefined : sectionId,
      status: status === "all" ? undefined : status,
    });
  }, [query, sectionId, status]);

  const visible = results.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search by PRAMS reference or title…"
            className="h-11 rounded-lg pl-10 text-sm"
            aria-label="Search announcement variants"
          />
        </div>
        <Select
          value={sectionId}
          onValueChange={(v) => {
            setSectionId(v as string);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <SelectTrigger className="h-11 rounded-lg sm:w-56" aria-label="Filter by section">
            <SelectValue>
              {(value: string) => (value === "all" ? "All sections" : getPramsSectionName(value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {PRAMS_SECTIONS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as PramsVariantStatus | "all");
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <SelectTrigger className="h-11 rounded-lg sm:w-52" aria-label="Filter by status">
            <SelectValue>
              {(value: PramsVariantStatus | "all") =>
                STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-text-muted">
        Showing {visible.length} of {results.length} announcement variant{results.length === 1 ? "" : "s"}
      </p>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No announcements match"
          description="Try clearing the search or filters."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="divide-y divide-border-subtle">
            {visible.map((variant) => (
              <AnnouncementVariantRow
                key={variant.scriptId}
                projectId={projectId}
                variant={variant}
                sectionName={getPramsSectionName(variant.sectionId)}
              />
            ))}
          </div>
        </div>
      )}

      {visibleCount < results.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full rounded-lg border border-border-subtle py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          Load more ({results.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
