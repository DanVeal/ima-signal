"use client";

import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { EmptyState } from "@/components/states/empty-state";
import { AttentionRow } from "@/components/dashboard/attention-row";
import { useDemoUser } from "@/lib/demo-user-context";
import { getAttentionItems, getOrganisation, getOverdueReviews } from "@/lib/mock/queries";

export function ReviewQueueContent() {
  const { currentUser } = useDemoUser();
  const organisation = getOrganisation(currentUser.organisationId);
  const orgType = organisation?.type ?? "ima";

  const overdue = getOverdueReviews(orgType);
  const attention = getAttentionItems(orgType).filter(
    (item) => !overdue.some((o) => o.audioVersion.id === item.audioVersion.id),
  );

  return (
    <>
      <PageHeader
        eyebrow="Review Queue"
        title="Review queue"
        description="Every recording currently waiting on your organisation, ranked by urgency."
      />
      <div className="space-y-6">
        {overdue.length > 0 && (
          <Panel
            title="Overdue"
            description="Past their internal or client review deadline."
            className="border-critical/25"
          >
            <div className="-mx-5 -my-5">
              {overdue.map((item) => (
                <AttentionRow key={item.audioVersion.id} item={item} overdue />
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Waiting on you" description="Not yet overdue.">
          {attention.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Queue clear"
              description="Nothing is currently waiting on your review."
            />
          ) : (
            <div className="-mx-5 -my-5">
              {attention.map((item) => (
                <AttentionRow key={item.audioVersion.id} item={item} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
