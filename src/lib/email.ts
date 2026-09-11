import { sendViaSmtp, smtpConfig } from "./smtp";

// Transactional email: invitations, password resets, email-change
// confirmations, applicant acknowledgements and digests. Resend when a key is
// set, then SMTP when a mailbox is configured (a Gmail account with an app
// password will do). With neither, the message is logged instead of sent and
// the result says so, so callers can record delivery status honestly.

export type EmailResult = { sent: boolean; skipped?: "no-provider" | "reserved-address"; error?: string };

export function fromAddress(): string {
  return process.env.CONTACT_FROM || "DevelMo <onboarding@resend.dev>";
}

// Addresses that can never receive mail: the example.* domains the automated
// tests use, and the top-level domains reserved for documentation and
// testing. Sending to them can only bounce, and with a real mailbox
// configured every test run would otherwise fill the inbox with bounces.
export function reservedAddress(email: string): boolean {
  return /@example\.(com|org|net)$|[.@](invalid|test|localhost|example)$/i.test(email.trim());
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<EmailResult> {
  if (reservedAddress(msg.to)) return { sent: false, skipped: "reserved-address", error: "reserved test address, not delivered" };
  const key = process.env.RESEND_API_KEY;
  const smtp = smtpConfig();
  if (!key && !smtp) {
    // A warning, not a debug print: mail is silently not being delivered and
    // the operator needs to see that in the server log.
    console.warn(`[email] no provider configured (RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASS), not sent -> ${msg.to}: ${msg.subject}`);
    return { sent: false, skipped: "no-provider" };
  }
  const errors: string[] = [];
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: fromAddress(), to: msg.to, subject: msg.subject, text: msg.text }),
      });
      if (res.ok) return { sent: true };
      errors.push(`Resend error ${res.status}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "send failed");
    }
  }
  if (smtp) {
    try {
      await sendViaSmtp(msg, smtp);
      return { sent: true };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "send failed");
    }
  }
  return { sent: false, error: errors.join("; ") };
}

export function siteUrl(): string {
  return process.env.ADMIN_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://develmo.com";
}
