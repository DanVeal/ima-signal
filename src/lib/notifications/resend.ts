/**
 * Thin Resend wrapper. Never throws — a failed or unconfigured send must
 * never block the review-engine action that triggered it (comment, change
 * request, approval all succeed regardless of email delivery).
 */
const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(params: { to: string | string[]; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping email:", params.subject);
    return;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "IMA Signal <onboarding@resend.dev>",
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      console.error("[notifications] Resend send failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[notifications] Resend send threw:", err);
  }
}
