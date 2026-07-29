/**
 * IMA Signal — demonstration data.
 *
 * Fictional Jet2-style radio production content used to preview the
 * product before Supabase is connected (Phase 2). Nothing here is real
 * client material. Dates are fixed (not computed from `Date.now()`) so the
 * demo reads consistently regardless of when it's viewed.
 */
import type {
  ActivityEvent,
  Approval,
  AudioItem,
  Campaign,
  ChangeRequest,
  Organisation,
  Project,
  ReviewComment,
  Script,
  UserProfile,
} from "@/types/domain";
import {
  pramsActivityEvents,
  pramsAudioItems,
  pramsChangeRequests,
  pramsComments,
  pramsProject,
  pramsScripts,
} from "./prams-library";

export const organisations: Organisation[] = [
  { id: "org-ima", type: "ima", name: "IMA" },
  { id: "org-jet2", type: "jet2", name: "Jet2" },
  { id: "org-studio", type: "studio", name: "Coastal Sound Studios" },
];

export const users: UserProfile[] = [
  {
    id: "user-priya",
    fullName: "Priya Anand",
    email: "priya.anand@ima.global",
    avatarInitials: "PA",
    organisationId: "org-ima",
    role: "ima_admin",
  },
  {
    id: "user-tom",
    fullName: "Tom Radcliffe",
    email: "tom.radcliffe@ima.global",
    avatarInitials: "TR",
    organisationId: "org-ima",
    role: "ima_producer",
  },
  {
    id: "user-sasha",
    fullName: "Sasha Lindqvist",
    email: "sasha.lindqvist@ima.global",
    avatarInitials: "SL",
    organisationId: "org-ima",
    role: "ima_reviewer",
  },
  {
    id: "user-helen",
    fullName: "Helen Marsh",
    email: "helen.marsh@jet2.com",
    avatarInitials: "HM",
    organisationId: "org-jet2",
    role: "jet2_reviewer",
  },
  {
    id: "user-craig",
    fullName: "Craig Osei",
    email: "craig.osei@jet2.com",
    avatarInitials: "CO",
    organisationId: "org-jet2",
    role: "jet2_reviewer",
  },
  {
    id: "user-fatima",
    fullName: "Fatima Iqbal",
    email: "fatima.iqbal@jet2.com",
    avatarInitials: "FI",
    organisationId: "org-jet2",
    role: "jet2_view_only",
  },
  {
    id: "user-ben",
    fullName: "Ben Foster",
    email: "ben.foster@coastalsound.studio",
    avatarInitials: "BF",
    organisationId: "org-studio",
    role: "studio_admin",
  },
  {
    id: "user-ellie",
    fullName: "Ellie Nakamura",
    email: "ellie.nakamura@coastalsound.studio",
    avatarInitials: "EN",
    organisationId: "org-studio",
    role: "studio_contributor",
  },
];

export const campaigns: Campaign[] = [
  { id: "camp-winter-sun", name: "Jet2 Winter Sun 2026", organisationId: "org-jet2" },
  { id: "camp-summer-sale", name: "Jet2 Summer Sale 2026", organisationId: "org-jet2" },
  { id: "camp-prams", name: "Jet2 Onboard Announcements (PRAMS)", organisationId: "org-jet2" },
];

export const projects: Project[] = [
  {
    id: "proj-winter-sun-w1",
    type: "standard_radio",
    campaignId: "camp-winter-sun",
    name: "Winter Sun Dynamic Radio — Wave 1",
    jobNumber: "JET-2026-0142",
    description:
      "Dynamic 30\" radio spots for five departure routes, promoting Winter Sun package deals with a shared VO structure and route-specific inserts.",
    status: "ready_for_jet2_review",
    ownerUserId: "user-tom",
    jet2ReviewerUserIds: ["user-helen", "user-craig"],
    studioOrganisationId: "org-studio",
    recordingDeadline: "2026-07-25",
    internalReviewDeadline: "2026-07-30",
    clientReviewDeadline: "2026-08-05",
    liveDate: "2026-08-11",
    expectedDurationSeconds: 30,
    audioFormat: "WAV 48kHz / 16-bit, broadcast mono",
    briefingNotes:
      "Warm, confident VO. Pace must land the price and dates clearly — client has flagged this segment as high-scrutiny for accuracy after last quarter's proofing miss.",
    mandatoryWording: [
      "Prices are per person, based on two adults sharing.",
      "ATOL protected. Terms apply, see jet2holidays.com.",
    ],
    importantClaims: [
      "From £399pp",
      "Selected dates in November and December",
      "Free 22kg baggage allowance",
    ],
    deliveryNotes: "Deliver as separate WAV per route, named per the studio brief naming convention.",
    notificationEmail: "productions@ima.global",
  },
  {
    id: "proj-winter-sun-w2",
    type: "standard_radio",
    campaignId: "camp-winter-sun",
    name: "Winter Sun Dynamic Radio — Wave 2",
    jobNumber: "JET-2026-0143",
    description: "Second wave of Winter Sun routes, recorded to the same brief as Wave 1.",
    status: "studio_recording",
    ownerUserId: "user-tom",
    jet2ReviewerUserIds: ["user-helen"],
    studioOrganisationId: "org-studio",
    recordingDeadline: "2026-08-08",
    internalReviewDeadline: "2026-08-12",
    clientReviewDeadline: "2026-08-18",
    liveDate: "2026-08-25",
    expectedDurationSeconds: 30,
    audioFormat: "WAV 48kHz / 16-bit, broadcast mono",
    briefingNotes: "As Wave 1 brief. Two additional routes added at client request.",
    mandatoryWording: [
      "Prices are per person, based on two adults sharing.",
      "ATOL protected. Terms apply, see jet2holidays.com.",
    ],
    importantClaims: ["From £429pp", "Selected dates in January and February"],
    deliveryNotes: "Deliver as separate WAV per route.",
  },
  {
    id: "proj-summer-late-escapes",
    type: "standard_radio",
    campaignId: "camp-summer-sale",
    name: "Summer Sale — Late Escapes",
    jobNumber: "JET-2026-0098",
    description: "Tactical late-availability spots for the tail end of the summer sale.",
    status: "delivered",
    ownerUserId: "user-priya",
    jet2ReviewerUserIds: ["user-craig", "user-fatima"],
    studioOrganisationId: "org-studio",
    recordingDeadline: "2026-06-20",
    internalReviewDeadline: "2026-06-24",
    clientReviewDeadline: "2026-06-27",
    liveDate: "2026-07-01",
    expectedDurationSeconds: 20,
    audioFormat: "WAV 48kHz / 16-bit, broadcast mono",
    briefingNotes: "Short, urgent tone. Delivered and live.",
    mandatoryWording: ["Prices are per person, based on two adults sharing.", "Subject to availability."],
    importantClaims: ["From £299pp", "Departing this week"],
    deliveryNotes: "Delivered to media agency 1 July.",
  },
  pramsProject,
];

export const scripts: Script[] = [
  {
    id: "script-mnc-tfs",
    projectId: "proj-winter-sun-w1",
    title: "Manchester to Tenerife",
    variantCode: "MAN-TFS",
    destination: "Tenerife",
    departureAirport: "Manchester",
    versions: [
      {
        id: "sv-mnc-tfs-1",
        scriptId: "script-mnc-tfs",
        versionNumber: 1,
        body: "Escape to Tenerife this winter with Jet2holidays, flying direct from Manchester. From £399pp, based on two adults sharing.",
        isApprovedForRecording: false,
        createdByUserId: "user-tom",
        createdAt: "2026-07-08T09:12:00Z",
        notes: "First draft — awaiting legal wording insert.",
      },
      {
        id: "sv-mnc-tfs-2",
        scriptId: "script-mnc-tfs",
        versionNumber: 2,
        body: "Escape to Tenerife this winter with Jet2holidays, flying direct from Manchester. From £399pp, based on two adults sharing, with selected dates in November and December. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com.",
        isApprovedForRecording: true,
        approvedByUserId: "user-priya",
        approvedAt: "2026-07-11T14:40:00Z",
        createdByUserId: "user-tom",
        createdAt: "2026-07-10T11:00:00Z",
        notes: "Legal wording and date range added. Approved for recording.",
      },
    ],
  },
  {
    id: "script-bhx-fao",
    projectId: "proj-winter-sun-w1",
    title: "Birmingham to Faro",
    variantCode: "BHX-FAO",
    destination: "Faro",
    departureAirport: "Birmingham",
    versions: [
      {
        id: "sv-bhx-fao-1",
        scriptId: "script-bhx-fao",
        versionNumber: 1,
        body: "The Algarve is closer than you think. Jet2holidays flies direct from Birmingham to Faro this winter, from £429pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com.",
        isApprovedForRecording: true,
        approvedByUserId: "user-priya",
        approvedAt: "2026-07-11T14:42:00Z",
        createdByUserId: "user-tom",
        createdAt: "2026-07-09T10:00:00Z",
      },
    ],
  },
  {
    id: "script-lba-alc",
    projectId: "proj-winter-sun-w1",
    title: "Leeds Bradford to Alicante",
    variantCode: "LBA-ALC",
    destination: "Alicante",
    departureAirport: "Leeds Bradford",
    versions: [
      {
        id: "sv-lba-alc-1",
        scriptId: "script-lba-alc",
        versionNumber: 1,
        body: "Costa Blanca sunshine, direct from Leeds Bradford. Jet2holidays to Alicante from £389pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com.",
        isApprovedForRecording: true,
        approvedByUserId: "user-priya",
        approvedAt: "2026-07-11T14:45:00Z",
        createdByUserId: "user-tom",
        createdAt: "2026-07-09T10:05:00Z",
      },
    ],
  },
  {
    id: "script-gla-acy",
    projectId: "proj-winter-sun-w1",
    title: "Glasgow to Lanzarote",
    variantCode: "GLA-ACE",
    destination: "Lanzarote",
    departureAirport: "Glasgow",
    versions: [
      {
        id: "sv-gla-ace-1",
        scriptId: "script-gla-acy",
        versionNumber: 1,
        body: "Year-round sunshine is waiting in Lanzarote, direct from Glasgow with Jet2holidays. From £419pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com.",
        isApprovedForRecording: true,
        approvedByUserId: "user-priya",
        approvedAt: "2026-07-11T14:46:00Z",
        createdByUserId: "user-tom",
        createdAt: "2026-07-09T10:10:00Z",
      },
    ],
  },
  {
    id: "script-lpl-fue",
    projectId: "proj-winter-sun-w1",
    title: "Liverpool to Fuerteventura",
    variantCode: "LPL-FUE",
    destination: "Fuerteventura",
    departureAirport: "Liverpool",
    versions: [
      {
        id: "sv-lpl-fue-1",
        scriptId: "script-lpl-fue",
        versionNumber: 1,
        body: "Golden beaches, direct from Liverpool. Jet2holidays to Fuerteventura from £409pp. Prices are per person, based on two adults sharing. ATOL protected. Terms apply, see jet2holidays.com.",
        isApprovedForRecording: false,
        createdByUserId: "user-tom",
        createdAt: "2026-07-12T09:00:00Z",
        notes: "Awaiting final price confirmation from client before approval.",
      },
    ],
  },
  ...pramsScripts,
];

/**
 * Word-level transcript for the review-page flagship demo (Manchester to
 * Tenerife). Low-confidence words are deliberately placed on the price and
 * URL — both high-risk categories per the QC rules — so the "transcription
 * confidence" and "script match" demos reinforce each other.
 */
function buildTranscript(words: string[], lowConfidenceIndexes: Set<number>) {
  let cursor = 320;
  return words.map((word, index) => {
    const durationMs = 180 + ((index * 37) % 140);
    const startMs = cursor;
    const endMs = startMs + durationMs;
    cursor = endMs + 40;
    const confidence = lowConfidenceIndexes.has(index)
      ? 0.58 + (index % 3) * 0.04
      : 0.9 + (index % 5) * 0.018;
    return {
      id: `tw-${index}`,
      word,
      startMs,
      endMs,
      confidence: Math.min(confidence, 0.99),
    };
  });
}

const v2Words =
  "Escape to Tenerife this winter with Jet2 Holidays flying direct from Manchester from three ninety nine pp based on two adults sharing with selected dates in November and December prices are per person based on two adults sharing ATOL protected terms apply see jet2holidays dot com".split(
    " ",
  );

export const demoTranscriptWords = buildTranscript(v2Words, new Set([13, 14, 15, 16, 43, 44, 45]));

const v1Words = [...v2Words];
v1Words[13] = "four";
v1Words[14] = "fifty";
v1Words[15] = "nine";
export const demoTranscriptWordsV1 = buildTranscript(v1Words, new Set([43, 44, 45]));

export const audioItems: AudioItem[] = [
  {
    id: "audio-mnc-tfs",
    scriptId: "script-mnc-tfs",
    versions: [
      {
        id: "av-mnc-tfs-1",
        audioItemId: "audio-mnc-tfs",
        versionNumber: 1,
        scriptVersionId: "sv-mnc-tfs-2",
        status: "jet2_changes_requested",
        isApproved: false,
        uploadedByUserId: "user-ben",
        createdAt: "2026-07-14T10:20:00Z",
        durationSeconds: 30,
        fileName: "JET2026_MAN-TFS_V1.wav",
        transcriptionStatus: "ready_for_review",
        overallConfidence: 0.94,
        notes: "First pass, house VO artist.",
        transcript: demoTranscriptWordsV1,
      },
      {
        id: "av-mnc-tfs-2",
        audioItemId: "audio-mnc-tfs",
        versionNumber: 2,
        scriptVersionId: "sv-mnc-tfs-2",
        status: "ready_for_jet2_review",
        isApproved: false,
        uploadedByUserId: "user-ben",
        createdAt: "2026-07-22T15:05:00Z",
        durationSeconds: 30,
        fileName: "JET2026_MAN-TFS_V2.wav",
        transcriptionStatus: "ready_for_review",
        overallConfidence: 0.97,
        notes: "Re-recorded with corrected price and full legal line per IMA change request.",
        transcript: demoTranscriptWords,
      },
    ],
  },
  {
    id: "audio-bhx-fao",
    scriptId: "script-bhx-fao",
    versions: [
      {
        id: "av-bhx-fao-1",
        audioItemId: "audio-bhx-fao",
        versionNumber: 1,
        scriptVersionId: "sv-bhx-fao-1",
        status: "ready_for_ima_review",
        isApproved: false,
        uploadedByUserId: "user-ben",
        createdAt: "2026-07-21T09:40:00Z",
        durationSeconds: 30,
        fileName: "JET2026_BHX-FAO_V1.wav",
        transcriptionStatus: "ready_for_review",
        overallConfidence: 0.91,
      },
    ],
  },
  {
    id: "audio-lba-alc",
    scriptId: "script-lba-alc",
    versions: [
      {
        id: "av-lba-alc-1",
        audioItemId: "audio-lba-alc",
        versionNumber: 1,
        scriptVersionId: "sv-lba-alc-1",
        status: "approved",
        isApproved: true,
        approvedByUserId: "user-helen",
        approvedAt: "2026-07-20T16:00:00Z",
        uploadedByUserId: "user-ellie",
        createdAt: "2026-07-15T12:00:00Z",
        durationSeconds: 29,
        fileName: "JET2026_LBA-ALC_V1.wav",
        transcriptionStatus: "ready_for_review",
        overallConfidence: 0.98,
      },
    ],
  },
  {
    id: "audio-gla-ace",
    scriptId: "script-gla-acy",
    versions: [
      {
        id: "av-gla-ace-1",
        audioItemId: "audio-gla-ace",
        versionNumber: 1,
        scriptVersionId: "sv-gla-ace-1",
        status: "uploaded",
        isApproved: false,
        uploadedByUserId: "user-ellie",
        createdAt: "2026-07-27T08:30:00Z",
        durationSeconds: 28,
        fileName: "JET2026_GLA-ACE_V1.wav",
        transcriptionStatus: "transcribing",
      },
    ],
  },
  {
    id: "audio-lpl-fue",
    scriptId: "script-lpl-fue",
    versions: [],
  },
  ...pramsAudioItems,
];

export const reviewComments: ReviewComment[] = [
  {
    id: "comment-1",
    projectId: "proj-winter-sun-w1",
    audioVersionId: "av-mnc-tfs-2",
    scriptVersionId: "sv-mnc-tfs-2",
    selectedText: "three ninety nine",
    startMs: demoTranscriptWords[13].startMs,
    endMs: demoTranscriptWords[15].endMs,
    authorUserId: "user-helen",
    authorOrganisationId: "org-jet2",
    category: "wording",
    body: "Good catch on the price fix — this now matches the approved script exactly. Confirming this is resolved.",
    status: "resolved",
    createdAt: "2026-07-22T16:10:00Z",
    replies: [
      {
        id: "reply-1",
        authorUserId: "user-tom",
        body: "Thanks Helen — studio re-recorded within 24 hours.",
        createdAt: "2026-07-22T16:40:00Z",
      },
    ],
  },
  {
    id: "comment-2",
    projectId: "proj-winter-sun-w1",
    audioVersionId: "av-mnc-tfs-2",
    scriptVersionId: "sv-mnc-tfs-2",
    selectedText: undefined,
    startMs: 8200,
    endMs: undefined,
    authorUserId: "user-craig",
    authorOrganisationId: "org-jet2",
    category: "pacing",
    body: "Pace picks up nicely into the legal line now — much clearer than V1. No action needed.",
    status: "open",
    createdAt: "2026-07-23T09:05:00Z",
    replies: [],
  },
  ...pramsComments,
];

export const changeRequests: ChangeRequest[] = [
  {
    id: "cr-1",
    projectId: "proj-winter-sun-w1",
    audioVersionId: "av-mnc-tfs-1",
    scriptVersionId: "sv-mnc-tfs-2",
    selectedText: "four fifty nine",
    requestedReplacement: "three ninety nine",
    note: "Recorded price doesn't match the approved script. This is a client-facing price — please re-record before we can send to Jet2.",
    category: "wording",
    priority: "urgent",
    assignedOrganisationId: "org-studio",
    assigneeUserId: "user-ben",
    dueDate: "2026-07-18",
    status: "addressed_in_new_version",
    reviewerUserId: "user-tom",
    createdAt: "2026-07-15T11:20:00Z",
    resolvedAt: "2026-07-22T15:05:00Z",
    resolutionNote: "Corrected in V2 — price and legal line now match the approved script.",
    resolvedInVersionId: "av-mnc-tfs-2",
  },
  {
    id: "cr-2",
    projectId: "proj-winter-sun-w1",
    audioVersionId: "av-bhx-fao-1",
    scriptVersionId: "sv-bhx-fao-1",
    selectedText: "",
    requestedReplacement: "",
    note: "VO drops the ATOL line slightly early — please confirm full legal wording is intact before this goes to Jet2.",
    category: "wording",
    priority: "high",
    assignedOrganisationId: "org-ima",
    dueDate: "2026-07-31",
    status: "open",
    reviewerUserId: "user-sasha",
    createdAt: "2026-07-27T13:00:00Z",
  },
  ...pramsChangeRequests,
];

export const approvals: Approval[] = [
  {
    id: "appr-1",
    projectId: "proj-winter-sun-w1",
    audioVersionId: "av-lba-alc-1",
    scriptVersionId: "sv-lba-alc-1",
    decision: "approve",
    reviewerUserId: "user-helen",
    reviewerOrganisationId: "org-jet2",
    comment: "Clean recording, matches script exactly. Approved.",
    decidedAt: "2026-07-20T16:00:00Z",
  },
];

export const activityEvents: ActivityEvent[] = [
  {
    id: "act-1",
    actorUserId: "user-tom",
    organisationId: "org-ima",
    projectId: "proj-winter-sun-w1",
    entityType: "project",
    entityLabel: "Winter Sun Dynamic Radio — Wave 1",
    action: "project_created",
    createdAt: "2026-07-06T09:00:00Z",
  },
  {
    id: "act-2",
    actorUserId: "user-priya",
    organisationId: "org-ima",
    projectId: "proj-winter-sun-w1",
    entityType: "script_version",
    entityLabel: "Manchester to Tenerife — V2",
    action: "script_approved",
    createdAt: "2026-07-11T14:40:00Z",
  },
  {
    id: "act-3",
    actorUserId: "user-ben",
    organisationId: "org-studio",
    projectId: "proj-winter-sun-w1",
    entityType: "audio_version",
    entityLabel: "Manchester to Tenerife — V1",
    action: "audio_uploaded",
    createdAt: "2026-07-14T10:20:00Z",
  },
  {
    id: "act-4",
    actorUserId: "user-tom",
    organisationId: "org-ima",
    projectId: "proj-winter-sun-w1",
    entityType: "change_request",
    entityLabel: "Manchester to Tenerife — price mismatch",
    action: "change_request_created",
    createdAt: "2026-07-15T11:20:00Z",
  },
  {
    id: "act-5",
    actorUserId: "user-ben",
    organisationId: "org-studio",
    projectId: "proj-winter-sun-w1",
    entityType: "audio_version",
    entityLabel: "Manchester to Tenerife — V2",
    action: "audio_version_created",
    createdAt: "2026-07-22T15:05:00Z",
  },
  {
    id: "act-6",
    actorUserId: "user-helen",
    organisationId: "org-jet2",
    projectId: "proj-winter-sun-w1",
    entityType: "audio_version",
    entityLabel: "Leeds Bradford to Alicante — V1",
    action: "approval_decided",
    createdAt: "2026-07-20T16:00:00Z",
  },
  {
    id: "act-7",
    actorUserId: "user-craig",
    organisationId: "org-jet2",
    projectId: "proj-winter-sun-w1",
    entityType: "comment",
    entityLabel: "Manchester to Tenerife — V2",
    action: "comment_added",
    createdAt: "2026-07-23T09:05:00Z",
  },
  {
    id: "act-8",
    actorUserId: "user-priya",
    organisationId: "org-ima",
    projectId: "proj-summer-late-escapes",
    entityType: "project",
    entityLabel: "Summer Sale — Late Escapes",
    action: "project_delivered",
    createdAt: "2026-07-01T17:30:00Z",
  },
  ...pramsActivityEvents,
];
