import { Check, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { ApprovalRecord } from "@/lib/review/queries";

const DECISION_META: Record<string, { label: string; icon: typeof Check; className: string }> = {
  approved: { label: "Approved", icon: Check, className: "border-emerald-300/50 text-emerald-700 dark:text-emerald-300" },
  changes_requested: { label: "Changes requested", icon: ShieldAlert, className: "border-amber-300/60 text-amber-700 dark:text-amber-300" },
  withdrawn: { label: "Withdrawn", icon: RotateCcw, className: "border-border text-text-muted" },
};

export function ApprovalCard({ approval, versionNumber }: { approval: ApprovalRecord; versionNumber?: number }) {
  const meta = DECISION_META[approval.decision] ?? DECISION_META.withdrawn;
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-3.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`gap-1 text-[10px] ${meta.className}`}>
          <Icon className="size-3" /> {meta.label}
        </Badge>
        {versionNumber != null && (
          <Badge variant="outline" className="text-[10px]">
            v{versionNumber}
          </Badge>
        )}
      </div>
      {approval.note && <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-800">{approval.note}</p>}
      <p className="mt-1.5 text-[11px] text-text-muted">
        {approval.decidedByName} · {formatDateTime(approval.createdAt)}
      </p>
    </div>
  );
}
