import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AudioStatusBadge } from "@/components/status/audio-status-badge";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import type { AttentionItem } from "@/lib/mock/queries";

export function AttentionRow({ item, overdue = false }: { item: AttentionItem; overdue?: boolean }) {
  return (
    <Link
      href={`/projects/${item.project.id}/audio/${item.audioVersion.audioItemId}`}
      className="group flex flex-col gap-3 border-b border-border-subtle px-5 py-4 transition-colors last:border-b-0 hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-900">{item.script.title}</p>
        <p className="truncate text-xs text-text-muted">
          {item.project.name} · {item.reason}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AudioStatusBadge status={item.audioVersion.status} />
        {overdue ? (
          <DeadlineBadge date={item.project.internalReviewDeadline} />
        ) : null}
        <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
