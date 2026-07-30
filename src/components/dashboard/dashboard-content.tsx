"use client";

import Link from "next/link";
import { Radio, CheckCircle2, ShieldCheck, CalendarRange } from "lucide-react";
import { PageContainer, Section } from "@/components/nav/page-container";
import { EmptyState } from "@/components/states/empty-state";
import { AttentionRow } from "@/components/dashboard/attention-row";
import { PramsDashboardSummary } from "@/components/dashboard/prams-dashboard-summary";
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

  const uniqueAttention = attentionItems.filter(
    (item) => !overdueItems.some((o) => o.audioVersion.id === item.audioVersion.id),
  );
  const totalNeedingAttention = overdueItems.length + uniqueAttention.length;

  const headline =
    totalNeedingAttention === 0
      ? "You're all clear"
      : totalNeedingAttention === 1
        ? "1 recording needs your attention"
        : `${totalNeedingAttention} recordings need your attention`;

  const subline =
    totalNeedingAttention === 0
      ? "Nothing is waiting on you right now — new uploads and review requests will land here."
      : overdueItems.length > 0
        ? `${overdueItems.length} of these ${overdueItems.length === 1 ? "is" : "are"} overdue. Ranked by urgency.`
        : "Ranked by urgency across your projects.";

  return (
    <PageContainer>
      <div className="mb-12 animate-in fade-in slide-in-from-bottom-1 duration-500">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide text-brand uppercase">
          <Radio className="size-3.5" strokeWidth={2.5} />
          {organisation?.name} workspace
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          {headline}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">{subline}</p>
      </div>

      <div className="space-y-12">
        <section>
          {totalNeedingAttention === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Signal clear"
              description="Nothing needs your review right now."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              {overdueItems.map((item) => (
                <AttentionRow key={`overdue-${item.audioVersion.id}`} item={item} overdue />
              ))}
              {uniqueAttention.map((item) => (
                <AttentionRow key={item.audioVersion.id} item={item} />
              ))}
            </div>
          )}
        </section>

        <PramsDashboardSummary />

        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
          <StatLink
            href="/review-queue"
            count={waitingForIma.length}
            label="Waiting for IMA review"
          />
          <StatLink
            href="/review-queue"
            count={waitingForJet2.length}
            label="Waiting for Jet2 review"
          />
          <StatLink
            href="/review-queue"
            count={studioChangeRequests.length}
            label="Changes waiting on the studio"
          />
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
          <Section title="Upcoming deadlines" description="Projects sorted by live date.">
            <ul>
              {upcomingDeadlines.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-ink-50"
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
          </Section>

          <Section title="Recent versions" description="Latest uploads and approvals.">
            <ul>
              {recentlyApproved.map((entry) => (
                <li key={`approved-${entry.version.id}`}>
                  <Link
                    href={`/projects/${entry.project.id}/audio/${entry.version.audioItemId}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-ink-50"
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
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-ink-50"
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
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function StatLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href as never} className="group block">
      <p
        className={`text-3xl font-semibold tabular-nums transition-colors ${
          count > 0 ? "text-ink-900 group-hover:text-brand" : "text-ink-300"
        }`}
      >
        {count}
      </p>
      <p className="mt-1 text-sm text-text-secondary group-hover:text-ink-800">{label}</p>
    </Link>
  );
}
