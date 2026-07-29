"use client";

import Link from "next/link";
import { CheckCircle2, Inbox, UploadCloud, ShieldCheck, CalendarRange } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/nav/page-container";
import { Panel } from "@/components/layout/panel";
import { EmptyState } from "@/components/states/empty-state";
import { AttentionRow } from "@/components/dashboard/attention-row";
import { DeadlineBadge } from "@/components/status/deadline-badge";
import { AudioStatusBadge } from "@/components/status/audio-status-badge";
import { useDemoUser } from "@/lib/demo-user-context";
import { formatDateTime, formatDate } from "@/lib/format";
import {
  getAttentionItems,
  getOverdueReviews,
  getOrganisation,
  getProjectsForOrganisation,
  getRecentAudioVersions,
  getRecentlyApproved,
  getVersionsByStatus,
  getOpenChangeRequestsForOrganisation,
} from "@/lib/mock/queries";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardContent() {
  const { currentUser } = useDemoUser();
  const organisation = getOrganisation(currentUser.organisationId);
  const orgType = organisation?.type ?? "ima";

  const attentionItems = getAttentionItems(orgType);
  const overdueItems = getOverdueReviews(orgType);
  const accessibleProjects = getProjectsForOrganisation(orgType, currentUser.organisationId);
  const projectIds = new Set(accessibleProjects.map((p) => p.id));

  const waitingForIma = getVersionsByStatus("ready_for_ima_review").filter((b) =>
    projectIds.has(b.project.id),
  );
  const waitingForJet2 = getVersionsByStatus("ready_for_jet2_review").filter((b) =>
    projectIds.has(b.project.id),
  );
  const studioChangeRequests = getOpenChangeRequestsForOrganisation("org-studio");

  const upcomingDeadlines = accessibleProjects
    .filter((p) => p.status !== "delivered")
    .sort((a, b) => new Date(a.liveDate).getTime() - new Date(b.liveDate).getTime());

  const recentVersions = getRecentAudioVersions(6).filter((v) => projectIds.has(v.project.id));
  const recentlyApproved = getRecentlyApproved(4).filter((v) => projectIds.has(v.project.id));

  const firstName = currentUser.fullName.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Home"
        title={`${greeting()}, ${firstName}`}
        description={`${organisation?.name ?? ""} · here's what's moving across your projects today.`}
      />

      <div className="space-y-6">
        <Panel
          title="Needs your attention"
          description="Ranked by what's currently sitting with you."
        >
          {overdueItems.length === 0 && attentionItems.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up"
              description="Nothing is waiting on you right now. New uploads and review requests will appear here."
            />
          ) : (
            <div className="-mx-5 -my-5">
              {overdueItems.map((item) => (
                <AttentionRow key={`overdue-${item.audioVersion.id}`} item={item} overdue />
              ))}
              {attentionItems
                .filter((item) => !overdueItems.some((o) => o.audioVersion.id === item.audioVersion.id))
                .map((item) => (
                  <AttentionRow key={item.audioVersion.id} item={item} />
                ))}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="Waiting for IMA review" href="/review-queue">
            <BucketList
              rows={waitingForIma}
              emptyLabel="Nothing waiting on IMA review."
              icon={Inbox}
            />
          </Panel>
          <Panel title="Waiting for Jet2 review" href="/review-queue">
            <BucketList
              rows={waitingForJet2}
              emptyLabel="Nothing waiting on Jet2 review."
              icon={Inbox}
            />
          </Panel>
          <Panel title="Changes waiting for the studio">
            {studioChangeRequests.length === 0 ? (
              <EmptyState
                icon={UploadCloud}
                title="No open change requests"
                description="Coastal Sound Studios has no outstanding wording changes."
              />
            ) : (
              <ul className="space-y-3">
                {studioChangeRequests.map((cr) => (
                  <li key={cr.id} className="text-sm">
                    <p className="font-medium text-ink-900">
                      &ldquo;{cr.requestedReplacement || cr.note}&rdquo;
                    </p>
                    <p className="text-xs text-text-muted">
                      Due {cr.dueDate ? formatDate(cr.dueDate) : "no date set"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Upcoming deadlines" description="Projects sorted by live date.">
            <ul className="space-y-1">
              {upcomingDeadlines.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-ink-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {project.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <CalendarRange className="size-3" />
                        Live {formatDate(project.liveDate)}
                      </span>
                    </span>
                    <DeadlineBadge date={project.liveDate} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent versions" description="Latest uploads and approvals.">
            <ul className="space-y-1">
              {recentlyApproved.map((entry) => (
                <li key={`approved-${entry.version.id}`}>
                  <Link
                    href={`/projects/${entry.project.id}/audio/${entry.version.audioItemId}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-ink-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {entry.script.title} · V{entry.version.versionNumber}
                      </span>
                      <span className="text-xs text-text-muted">
                        Approved {entry.version.approvedAt ? formatDateTime(entry.version.approvedAt) : ""}
                      </span>
                    </span>
                    <ShieldCheck className="size-4 shrink-0 text-success" />
                  </Link>
                </li>
              ))}
              {recentVersions
                .filter((entry) => !entry.version.isApproved)
                .slice(0, 4)
                .map((entry) => (
                  <li key={`recent-${entry.version.id}`}>
                    <Link
                      href={`/projects/${entry.project.id}/audio/${entry.version.audioItemId}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 -mx-2 transition-colors hover:bg-ink-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {entry.script.title} · V{entry.version.versionNumber}
                        </span>
                        <span className="text-xs text-text-muted">
                          Uploaded {formatDateTime(entry.version.createdAt)}
                        </span>
                      </span>
                      <AudioStatusBadge status={entry.version.status} />
                    </Link>
                  </li>
                ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

function BucketList({
  rows,
  emptyLabel,
  icon,
}: {
  rows: { project: { id: string; name: string }; script: { title: string }; audioVersion: { id: string; audioItemId: string; versionNumber: number } }[];
  emptyLabel: string;
  icon: LucideIcon;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={icon} title="Nothing here" description={emptyLabel} />;
  }
  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.audioVersion.id}>
          <Link
            href={`/projects/${row.project.id}/audio/${row.audioVersion.audioItemId}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2 -mx-2 transition-colors hover:bg-ink-50"
          >
            <span className="min-w-0 truncate text-sm text-ink-800">{row.script.title}</span>
            <span className="shrink-0 font-mono text-xs text-text-muted">
              V{row.audioVersion.versionNumber}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
