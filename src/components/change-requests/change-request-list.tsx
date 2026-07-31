import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { ChangeRequestStatusBadge } from "./change-request-status";
import { formatDate } from "@/lib/format";
import { getOrganisation, getUser } from "@/lib/mock/queries";
import type { ChangeRequest } from "@/types/domain";

const PRIORITY_LABEL: Record<ChangeRequest["priority"], string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
  urgent: "Urgent",
};

export function ChangeRequestList({ changeRequests }: { changeRequests: ChangeRequest[] }) {
  if (changeRequests.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No change requests"
        description="Turn a comment into a structured change request when specific wording needs to change."
        className="py-8"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {changeRequests.map((cr) => {
        const reviewer = getUser(cr.reviewerUserId);
        const assignedOrg = getOrganisation(cr.assignedOrganisationId);
        return (
          <li key={cr.id} className="rounded-md border border-border-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <ChangeRequestStatusBadge status={cr.status} />
              <span className="text-[11px] font-medium text-critical">
                {cr.priority === "urgent" || cr.priority === "high" ? PRIORITY_LABEL[cr.priority] : null}
              </span>
            </div>

            {cr.selectedText && (
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-text-muted">
                  Change{" "}
                  <span className="text-text-emphasis line-through decoration-critical">
                    &ldquo;{cr.selectedText}&rdquo;
                  </span>{" "}
                  to <span className="font-medium text-success">&ldquo;{cr.requestedReplacement}&rdquo;</span>
                </p>
              </div>
            )}
            {cr.note && <p className="mt-2 text-sm text-text-emphasis">{cr.note}</p>}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
              <span>
                Requested by {reviewer?.fullName} · assigned to {assignedOrg?.name}
              </span>
              {cr.dueDate && <span>Due {formatDate(cr.dueDate)}</span>}
            </div>

            {cr.resolutionNote && (
              <p className="mt-2 rounded-md bg-success-100 px-2.5 py-1.5 text-xs text-ink-700">
                {cr.resolutionNote}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
