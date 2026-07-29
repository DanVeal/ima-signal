/**
 * Domain types for IMA Signal.
 *
 * These mirror the planned Supabase schema (see docs/architecture.md) so
 * that Phase 1 mock data and later Supabase-backed data share one shape.
 * Dates are ISO 8601 strings throughout, matching Postgres `timestamptz`
 * as returned by the Supabase client.
 */

export type OrganisationType = "ima" | "jet2" | "studio";

export type ImaRole = "ima_admin" | "ima_producer" | "ima_reviewer";
export type Jet2Role = "jet2_reviewer" | "jet2_view_only";
export type StudioRole = "studio_admin" | "studio_contributor";
export type OrgRole = ImaRole | Jet2Role | StudioRole;

export interface Organisation {
  id: string;
  type: OrganisationType;
  name: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarInitials: string;
  organisationId: string;
  role: OrgRole;
}

export type ProjectStatus =
  | "draft_script"
  | "ready_to_record"
  | "studio_recording"
  | "ready_for_ima_review"
  | "ima_changes_requested"
  | "ready_for_jet2_review"
  | "jet2_changes_requested"
  | "approved"
  | "delivered";

export interface Campaign {
  id: string;
  name: string;
  organisationId: string;
}

export interface Project {
  id: string;
  campaignId: string;
  name: string;
  jobNumber: string;
  description: string;
  status: ProjectStatus;
  ownerUserId: string;
  jet2ReviewerUserIds: string[];
  studioOrganisationId: string;
  recordingDeadline: string;
  internalReviewDeadline: string;
  clientReviewDeadline: string;
  liveDate: string;
  expectedDurationSeconds: number;
  audioFormat: string;
  briefingNotes: string;
  mandatoryWording: string[];
  importantClaims: string[];
  deliveryNotes: string;
  notificationEmail?: string;
}

export type DifferenceSeverity = "critical" | "important" | "minor" | "uncertain";

export type DifferenceType =
  | "missing"
  | "added"
  | "replaced"
  | "number"
  | "price"
  | "date"
  | "destination"
  | "airport"
  | "offer"
  | "mandatory_wording"
  | "legal_wording"
  | "repeated_section"
  | "missing_sentence";

export interface ScriptVersion {
  id: string;
  scriptId: string;
  versionNumber: number;
  body: string;
  isApprovedForRecording: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  notes?: string;
  createdByUserId: string;
  createdAt: string;
}

export interface Script {
  id: string;
  projectId: string;
  title: string;
  variantCode: string;
  destination?: string;
  departureAirport?: string;
  versions: ScriptVersion[];
}

export type AudioVersionStatus =
  | "uploaded"
  | "queued"
  | "transcribing"
  | "comparing"
  | "ready_for_ima_review"
  | "ima_changes_requested"
  | "ready_for_jet2_review"
  | "jet2_changes_requested"
  | "approved"
  | "failed";

export interface TranscriptWord {
  id: string;
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface QcDifference {
  id: string;
  type: DifferenceType;
  severity: DifferenceSeverity;
  expectedText: string;
  actualText: string;
  startMs: number;
  endMs: number;
  scriptSectionRef?: string;
  confidence?: number;
}

export interface QcResult {
  matchPercentage: number;
  differences: QcDifference[];
}

export interface AudioVersion {
  id: string;
  audioItemId: string;
  versionNumber: number;
  scriptVersionId: string;
  status: AudioVersionStatus;
  isApproved: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  notes?: string;
  uploadedByUserId: string;
  createdAt: string;
  durationSeconds: number;
  fileName: string;
  transcriptionStatus:
    | "uploading"
    | "uploaded"
    | "queued"
    | "transcribing"
    | "comparing"
    | "ready_for_review"
    | "failed"
    | "retry_required";
  overallConfidence?: number;
  transcript?: TranscriptWord[];
  qc?: QcResult;
}

export interface AudioItem {
  id: string;
  scriptId: string;
  versions: AudioVersion[];
}

export type CommentCategory =
  | "wording"
  | "replacement_copy"
  | "performance"
  | "pacing"
  | "timing"
  | "music_sound"
  | "technical_issue"
  | "general";

export type CommentStatus = "open" | "resolved" | "reopened";

export interface CommentReply {
  id: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  projectId: string;
  audioVersionId: string;
  scriptVersionId: string;
  selectedText?: string;
  startMs?: number;
  endMs?: number;
  authorUserId: string;
  authorOrganisationId: string;
  category: CommentCategory;
  body: string;
  status: CommentStatus;
  createdAt: string;
  editedAt?: string;
  replies: CommentReply[];
}

export type ChangeRequestPriority = "low" | "medium" | "high" | "urgent";
export type ChangeRequestStatus =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "addressed_in_new_version"
  | "resolved"
  | "rejected"
  | "reopened";

export interface ChangeRequest {
  id: string;
  projectId: string;
  audioVersionId: string;
  scriptVersionId: string;
  selectedText: string;
  requestedReplacement: string;
  note?: string;
  category: CommentCategory;
  priority: ChangeRequestPriority;
  assignedOrganisationId: string;
  assigneeUserId?: string;
  dueDate?: string;
  status: ChangeRequestStatus;
  reviewerUserId: string;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
  resolvedInVersionId?: string;
}

export type ApprovalDecision =
  | "approve"
  | "approve_minor"
  | "request_changes"
  | "return_to_ima"
  | "not_ready";

export interface Approval {
  id: string;
  projectId: string;
  audioVersionId: string;
  scriptVersionId: string;
  decision: ApprovalDecision;
  reviewerUserId: string;
  reviewerOrganisationId: string;
  comment?: string;
  decidedAt: string;
}

export type ActivityAction =
  | "project_created"
  | "project_edited"
  | "user_invited"
  | "script_created"
  | "script_approved"
  | "audio_uploaded"
  | "audio_version_created"
  | "transcription_completed"
  | "qc_completed"
  | "comment_added"
  | "change_request_created"
  | "change_request_resolved"
  | "status_changed"
  | "approval_decided"
  | "project_delivered";

export interface ActivityEvent {
  id: string;
  actorUserId: string;
  organisationId: string;
  projectId: string;
  entityType: string;
  entityLabel: string;
  action: ActivityAction;
  createdAt: string;
}
