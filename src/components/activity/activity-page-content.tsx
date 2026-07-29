"use client";

import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { ActivityList } from "@/components/activity/activity-list";
import { useDemoUser } from "@/lib/demo-user-context";
import { getAllActivity, getOrganisation, getProjectsForOrganisation } from "@/lib/mock/queries";

export function ActivityPageContent() {
  const { currentUser } = useDemoUser();
  const organisation = getOrganisation(currentUser.organisationId);
  const accessibleProjectIds = new Set(
    getProjectsForOrganisation(organisation?.type ?? "ima", currentUser.organisationId).map(
      (p) => p.id,
    ),
  );
  const events = getAllActivity().filter((e) => accessibleProjectIds.has(e.projectId));

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Activity"
        description="A complete, readable history of everything that's happened across your projects."
      />
      <Panel title="Recent activity">
        <ActivityList events={events} />
      </Panel>
    </>
  );
}
