/**
 * Recipient resolution + content for the three notification events approved
 * for launch: change request raised, comment @mention, approval decision
 * made. Called from review/actions.ts right after the underlying mutation
 * succeeds. Every function here swallows its own errors (via sendEmail) so a
 * notification problem never surfaces as a failed user action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getAudioItemDetail } from "@/lib/audio/queries";
import { sendEmail } from "./resend";
import type { ApprovalDecision, ChangeRequestCategory, ChangeRequestPriority } from "@/lib/review/service";

type Client = SupabaseClient<Database>;

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function recordingUrl(projectId: string, audioItemId: string) {
  return `${siteUrl()}/projects/${projectId}/recordings/${audioItemId}`;
}

interface Recipient {
  id: string;
  email: string;
  fullName: string;
}

async function getRecipients(supabase: Client, userIds: (string | null | undefined)[]): Promise<Recipient[]> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("user_profiles").select("id, email, full_name").in("id", ids);
  if (error) throw error;
  return data.map((row) => ({ id: row.id, email: row.email, fullName: row.full_name }));
}

/** Project owner's recipient, preferring the project's own notification_email override if set. */
async function getProjectOwnerRecipients(supabase: Client, projectId: string): Promise<Recipient[]> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("owner_user_id, notification_email")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return [];

  if (project.notification_email) {
    return [{ id: "override", email: project.notification_email, fullName: "" }];
  }
  return getRecipients(supabase, [project.owner_user_id]);
}

function emailShell(heading: string, bodyHtml: string, ctaUrl: string, ctaLabel: string) {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #888; margin-bottom: 4px;">IMA Signal</p>
      <h2 style="font-size: 18px; margin: 0 0 16px;">${heading}</h2>
      ${bodyHtml}
      <p style="margin-top: 24px;">
        <a href="${ctaUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;">${ctaLabel}</a>
      </p>
    </div>
  `;
}

export async function notifyChangeRequestRaised(
  supabase: Client,
  params: {
    audioItemId: string;
    category: ChangeRequestCategory;
    priority: ChangeRequestPriority;
    message: string;
    raisedByUserId: string;
  },
): Promise<void> {
  const detail = await getAudioItemDetail(supabase, params.audioItemId);
  const recipients = (await getProjectOwnerRecipients(supabase, detail.projectId)).filter(
    (r) => r.id !== params.raisedByUserId,
  );
  if (recipients.length === 0) return;

  const url = recordingUrl(detail.projectId, params.audioItemId);
  const html = emailShell(
    `Change request raised on ${detail.label}`,
    `<p style="font-size: 14px; line-height: 1.5;">Priority: <strong>${params.priority}</strong> · Category: ${params.category}</p>
     <p style="font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${params.message}</p>`,
    url,
    "View recording",
  );

  await sendEmail({
    to: recipients.map((r) => r.email),
    subject: `Change request: ${detail.label}`,
    html,
  });
}

export async function notifyMention(
  supabase: Client,
  params: {
    audioItemId: string;
    mentionedUserIds: string[];
    commentBody: string;
    authorUserId: string;
  },
): Promise<void> {
  const mentioned = params.mentionedUserIds.filter((id) => id !== params.authorUserId);
  if (mentioned.length === 0) return;

  const [detail, recipients, [author]] = await Promise.all([
    getAudioItemDetail(supabase, params.audioItemId),
    getRecipients(supabase, mentioned),
    getRecipients(supabase, [params.authorUserId]),
  ]);
  if (recipients.length === 0) return;

  const url = recordingUrl(detail.projectId, params.audioItemId);
  const html = emailShell(
    `${author?.fullName ?? "Someone"} mentioned you on ${detail.label}`,
    `<p style="font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${params.commentBody}</p>`,
    url,
    "View comment",
  );

  await sendEmail({
    to: recipients.map((r) => r.email),
    subject: `${author?.fullName ?? "Someone"} mentioned you: ${detail.label}`,
    html,
  });
}

export async function notifyApprovalDecision(
  supabase: Client,
  params: {
    audioItemId: string;
    audioVersionId: string;
    decision: ApprovalDecision;
    note?: string;
    decidedByUserId: string;
  },
): Promise<void> {
  const detail = await getAudioItemDetail(supabase, params.audioItemId);
  const version = detail.versions.find((v) => v.id === params.audioVersionId);

  const [owners, uploader] = await Promise.all([
    getProjectOwnerRecipients(supabase, detail.projectId),
    getRecipients(supabase, [version?.uploadedByUserId]),
  ]);
  const recipients = [...owners, ...uploader].filter(
    (r, index, all) => r.id !== params.decidedByUserId && all.findIndex((x) => x.email === r.email) === index,
  );
  if (recipients.length === 0) return;

  const decisionLabel = params.decision === "approved" ? "Approved" : "Changes requested";
  const url = recordingUrl(detail.projectId, params.audioItemId);
  const html = emailShell(
    `${decisionLabel}: ${detail.label}`,
    params.note ? `<p style="font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${params.note}</p>` : "",
    url,
    "View recording",
  );

  await sendEmail({
    to: recipients.map((r) => r.email),
    subject: `${decisionLabel}: ${detail.label}`,
    html,
  });
}
