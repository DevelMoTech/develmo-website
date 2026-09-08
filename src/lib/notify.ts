import { fromAddress } from "./email";
import { formSubmitUrl } from "./submissions/delivery";

// Notices to the site's own people, an admin being told about a new access
// request, or a test message from the settings page. These take the same road
// the contact form takes to reach the inbox: Resend when a key is set, then
// the webhook, then FormSubmit. The chain exists because Resend needs a key
// and a verified sending domain, neither of which this code can provide, and
// an admin not hearing about a request is worse than a request arriving by
// an unglamorous route. Never throws; the outcome says what happened.

export type NoticeChannel = "resend" | "webhook" | "formsubmit";
export type NoticeOutcome = { status: "sent" | "failed"; channel: NoticeChannel | null; error: string | null };
export type Notice = {
  to: string;
  subject: string;
  text: string;
  // Column and value pairs, for the channels that render a table.
  fields: Record<string, string>;
  replyTo?: string;
};

const TIMEOUT_MS = 8000;

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message;
    return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message;
  }
  return String(err);
}

async function viaResend(n: Notice, key: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: fromAddress(), to: n.to, reply_to: n.replyTo, subject: n.subject, text: n.text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
}

async function viaWebhook(n: Notice, url: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "notice", to: n.to, subject: n.subject, message: n.text, ...n.fields }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`webhook error ${res.status}`);
}

async function viaFormSubmit(n: Notice): Promise<void> {
  const res = await fetch(formSubmitUrl(n.to), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ _subject: n.subject, _template: "table", _captcha: "false", ...(n.replyTo ? { _replyto: n.replyTo } : {}), ...n.fields, message: n.text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FormSubmit error ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { success?: string | boolean };
  if (json.success === "false" || json.success === false) throw new Error("FormSubmit rejected the message");
}

export async function deliverNotice(n: Notice): Promise<NoticeOutcome> {
  const errors: string[] = [];
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      await viaResend(n, key);
      return { status: "sent", channel: "resend", error: null };
    } catch (err) {
      errors.push(`resend: ${describe(err)}`);
    }
  }
  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      await viaWebhook(n, webhook);
      return { status: "sent", channel: "webhook", error: errors.length ? errors.join("; ") : null };
    } catch (err) {
      errors.push(`webhook: ${describe(err)}`);
    }
  }
  try {
    await viaFormSubmit(n);
    return { status: "sent", channel: "formsubmit", error: errors.length ? errors.join("; ") : null };
  } catch (err) {
    errors.push(`formsubmit: ${describe(err)}`);
  }
  return { status: "failed", channel: null, error: errors.join("; ") };
}

// What the settings page shows: which channels are configured, from the
// environment alone, with no secret values.
export type EmailDeliveryStatus = {
  resend: { configured: boolean; from: string; fromIsShared: boolean };
  webhook: { configured: boolean };
  formsubmit: { endpoint: string; overridden: boolean };
};

export function emailDeliveryStatus(): EmailDeliveryStatus {
  const from = fromAddress();
  return {
    resend: { configured: !!process.env.RESEND_API_KEY, from, fromIsShared: /resend\.dev/i.test(from) },
    webhook: { configured: !!process.env.CONTACT_WEBHOOK_URL },
    formsubmit: { endpoint: (process.env.FORMSUBMIT_URL || "https://formsubmit.co/ajax").replace(/\/$/, ""), overridden: !!process.env.FORMSUBMIT_URL },
  };
}
