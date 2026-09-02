// Transactional email through Resend's REST API (same call the contact form
// already makes). Without RESEND_API_KEY the message is logged instead of sent
// and the result says so, so callers can record delivery status honestly.

export type EmailResult = { sent: boolean; skipped?: "no-api-key"; error?: string };

export function fromAddress(): string {
  return process.env.CONTACT_FROM || "DevelMo <onboarding@resend.dev>";
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY unset, not sent -> ${msg.to}: ${msg.subject}`);
    return { sent: false, skipped: "no-api-key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) return { sent: false, error: `Resend error ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

export function siteUrl(): string {
  return process.env.ADMIN_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://develmo.com";
}
