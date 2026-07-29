import type {
  AudioItem,
  AudioVersion,
  AudioVersionStatus,
  ChangeRequest,
  OrganisationType,
  Project,
  ReviewComment,
  Script,
} from "@/types/domain";
import {
  activityEvents,
  audioItems,
  campaigns,
  changeRequests,
  organisations,
  projects,
  reviewComments,
  scripts,
  users,
} from "./data";
import { qcByAudioVersionId } from "./qc";

export function getUser(userId: string) {
  return users.find((user) => user.id === userId);
}

export function getOrganisation(organisationId: string) {
  return organisations.find((org) => org.id === organisationId);
}

export function getCampaign(campaignId: string) {
  return campaigns.find((campaign) => campaign.id === campaignId);
}

export function getAllUsers() {
  return users;
}

export function getAllOrganisations() {
  return organisations;
}

export function getScriptsForProject(projectId: string): Script[] {
  return scripts.filter((script) => script.projectId === projectId);
}

export function getAudioItemForScript(scriptId: string): AudioItem | undefined {
  return audioItems.find((item) => item.scriptId === scriptId);
}

export function getAudioItemById(audioItemId: string): AudioItem | undefined {
  return audioItems.find((item) => item.id === audioItemId);
}

export function getLatestVersion(item: AudioItem): AudioVersion | undefined {
  if (item.versions.length === 0) return undefined;
  return [...item.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

export function getAudioVersionWithQc(versionId: string) {
  for (const item of audioItems) {
    const version = item.versions.find((v) => v.id === versionId);
    if (version) {
      return { ...version, qc: version.qc ?? qcByAudioVersionId[versionId] };
    }
  }
  return undefined;
}

export function getScriptForAudioItem(itemId: string): Script | undefined {
  const item = audioItems.find((i) => i.id === itemId);
  if (!item) return undefined;
  return scripts.find((s) => s.id === item.scriptId);
}

export function getScriptVersion(scriptId: string, scriptVersionId: string) {
  const script = scripts.find((s) => s.id === scriptId);
  return script?.versions.find((v) => v.id === scriptVersionId);
}

export function getApprovedScriptVersion(scriptId: string) {
  const script = scripts.find((s) => s.id === scriptId);
  return script?.versions.find((v) => v.isApprovedForRecording);
}

export function getCommentsForAudioVersion(audioVersionId: string): ReviewComment[] {
  return reviewComments.filter((c) => c.audioVersionId === audioVersionId);
}

export function getChangeRequestsForAudioVersion(audioVersionId: string): ChangeRequest[] {
  return changeRequests.filter((c) => c.audioVersionId === audioVersionId);
}

export function getChangeRequestsForProject(projectId: string): ChangeRequest[] {
  return changeRequests.filter((c) => c.projectId === projectId);
}

export function getActivityForProject(projectId: string) {
  return activityEvents
    .filter((e) => e.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getAllActivity() {
  return [...activityEvents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getAllProjects() {
  return projects;
}

export function getProjectById(projectId: string): Project | undefined {
  return projects.find((p) => p.id === projectId);
}

/** Which organisation type owns the next action for a given audio-version status. */
export const STATUS_OWNER: Record<AudioVersionStatus, OrganisationType | "system" | "none"> = {
  uploaded: "system",
  queued: "system",
  transcribing: "system",
  comparing: "system",
  ready_for_ima_review: "ima",
  ima_changes_requested: "studio",
  ready_for_jet2_review: "jet2",
  jet2_changes_requested: "studio",
  approved: "none",
  failed: "studio",
};

export const STATUS_LABEL: Record<AudioVersionStatus, string> = {
  uploaded: "Awaiting transcription",
  queued: "Queued for transcription",
  transcribing: "Transcribing audio",
  comparing: "Running script comparison",
  ready_for_ima_review: "Awaiting IMA review",
  ima_changes_requested: "Changes requested — awaiting studio re-record",
  ready_for_jet2_review: "Awaiting Jet2 review",
  jet2_changes_requested: "Changes requested — awaiting studio re-record",
  approved: "Approved",
  failed: "Transcription failed — retry required",
};

export interface VariantRow {
  script: Script;
  audioItem: AudioItem;
  latestVersion: AudioVersion | undefined;
  matchPercentage: number | undefined;
  criticalCount: number;
  openComments: number;
  openChangeRequests: number;
}

export function getBatchReviewRows(projectId: string): VariantRow[] {
  const projectScripts = getScriptsForProject(projectId);
  return projectScripts.map((script) => {
    const audioItem = getAudioItemForScript(script.id) ?? { id: "", scriptId: script.id, versions: [] };
    const latestVersion = getLatestVersion(audioItem);
    const qc = latestVersion ? qcByAudioVersionId[latestVersion.id] : undefined;
    const criticalCount = qc?.differences.filter((d) => d.severity === "critical").length ?? 0;
    const openComments = latestVersion
      ? getCommentsForAudioVersion(latestVersion.id).filter((c) => c.status !== "resolved").length
      : 0;
    const openChangeRequests = latestVersion
      ? getChangeRequestsForAudioVersion(latestVersion.id).filter(
          (c) => !["resolved", "rejected"].includes(c.status),
        ).length
      : 0;
    return {
      script,
      audioItem,
      latestVersion,
      matchPercentage: qc?.matchPercentage,
      criticalCount,
      openComments,
      openChangeRequests,
    };
  });
}

export interface AttentionItem {
  project: Project;
  script: Script;
  audioVersion: AudioVersion;
  reason: string;
}

/** Items where the current user's organisation owns the next action. */
export function getAttentionItems(organisationType: OrganisationType): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const project of projects) {
    const projectScripts = getScriptsForProject(project.id);
    for (const script of projectScripts) {
      const audioItem = getAudioItemForScript(script.id);
      const latest = audioItem ? getLatestVersion(audioItem) : undefined;
      if (!latest) continue;
      if (STATUS_OWNER[latest.status] === organisationType) {
        items.push({
          project,
          script,
          audioVersion: latest,
          reason: STATUS_LABEL[latest.status],
        });
      }
    }
  }
  return items;
}

export function getRecentAudioVersions(limit = 5) {
  const all: { project: Project; script: Script; version: AudioVersion }[] = [];
  for (const item of audioItems) {
    const script = scripts.find((s) => s.id === item.scriptId);
    const project = script ? projects.find((p) => p.id === script.projectId) : undefined;
    if (!script || !project) continue;
    for (const version of item.versions) {
      all.push({ project, script, version });
    }
  }
  return all
    .sort((a, b) => new Date(b.version.createdAt).getTime() - new Date(a.version.createdAt).getTime())
    .slice(0, limit);
}

export function getRecentlyApproved(limit = 5) {
  return getRecentAudioVersions(50)
    .filter((entry) => entry.version.isApproved)
    .sort(
      (a, b) =>
        new Date(b.version.approvedAt ?? 0).getTime() - new Date(a.version.approvedAt ?? 0).getTime(),
    )
    .slice(0, limit);
}

export function getUpcomingDeadlines() {
  return [...projects].sort((a, b) => new Date(a.liveDate).getTime() - new Date(b.liveDate).getTime());
}

export function getProjectProgress(projectId: string) {
  const projectScripts = getScriptsForProject(projectId);
  let approved = 0;
  for (const script of projectScripts) {
    const item = getAudioItemForScript(script.id);
    const latest = item ? getLatestVersion(item) : undefined;
    if (latest?.isApproved) approved += 1;
  }
  return { total: projectScripts.length, approved };
}

export function getProjectsForOrganisation(organisationType: OrganisationType, organisationId: string) {
  if (organisationType === "studio") {
    return projects.filter((p) => p.studioOrganisationId === organisationId);
  }
  // IMA and Jet2 both currently work across the whole (single-client) book of projects.
  return projects;
}

export interface WaitingBucket {
  project: Project;
  script: Script;
  audioVersion: AudioVersion;
}

/** All audio versions currently sitting in a given status, across accessible projects. */
export function getVersionsByStatus(status: AudioVersionStatus): WaitingBucket[] {
  const rows: WaitingBucket[] = [];
  for (const item of audioItems) {
    const script = scripts.find((s) => s.id === item.scriptId);
    if (!script) continue;
    const project = projects.find((p) => p.id === script.projectId);
    if (!project) continue;
    const latest = getLatestVersion(item);
    if (latest && latest.status === status) {
      rows.push({ project, script, audioVersion: latest });
    }
  }
  return rows;
}

export function getOpenChangeRequestsForOrganisation(organisationId: string) {
  return changeRequests.filter(
    (c) => c.assignedOrganisationId === organisationId && !["resolved", "rejected"].includes(c.status),
  );
}

export function getOverdueReviews(organisationType: OrganisationType): AttentionItem[] {
  const now = new Date();
  const relevantStatuses: AudioVersionStatus[] =
    organisationType === "ima"
      ? ["ready_for_ima_review"]
      : organisationType === "jet2"
        ? ["ready_for_jet2_review"]
        : ["ima_changes_requested", "jet2_changes_requested", "failed"];

  const deadlineField: keyof Project =
    organisationType === "ima" ? "internalReviewDeadline" : "clientReviewDeadline";

  const items: AttentionItem[] = [];
  for (const project of projects) {
    const deadline = new Date(`${project[deadlineField]}T23:59:59Z`);
    if (deadline >= now) continue;
    for (const script of getScriptsForProject(project.id)) {
      const audioItem = getAudioItemForScript(script.id);
      const latest = audioItem ? getLatestVersion(audioItem) : undefined;
      if (latest && relevantStatuses.includes(latest.status)) {
        items.push({ project, script, audioVersion: latest, reason: STATUS_LABEL[latest.status] });
      }
    }
  }
  return items;
}
