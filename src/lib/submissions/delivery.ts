import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { submissions } from "@/db/schema";

// The contact form's delivery chain (brief §3.5), now fed from a stored row.
// Channels are tried in order and the first success wins: Resend when
// RESEND_API_KEY is set, the webhook when CONTACT_WEBHOOK_URL is set, then
// FormSubmit. A channel that is not configured is skipped; one that fails
// is recorded and the next is tried. The outcome is written back to the row,
// so a delivery failure marks the enquiry, it never loses it.

export type SubmissionRow = typeof submissions.$inferSelect;
export type DeliveryOutcome = { status: "sent" | "failed" | "skipped"; channel: string | null; error: string | null };

const TIMEOUT_MS = 8000;

// Automated QA submissions use the reserved example.* domains and are never delivered.
export function qaAddress(email: string): boolean {
  return /@example\.(com|org|net)$/i.test(email);
}

// FORMSUBMIT_URL overrides the endpoint so a test can point it somewhere
// unreachable and prove the failure path; unset means the real service.
export function formSubmitUrl(to: string): string {
  const base = (process.env.FORMSUBMIT_URL || "https://formsubmit.co/ajax").replace(/\/$/, "");
  return `${base}/${to}`;
}

// The same subject and text the route sent before the rewrite, rebuilt from
// the row (the qualifiers the form used to append as "[Context] ..." are now
// columns, and are appended back here so the email reads as it always has).
export function deliveryText(row: SubmissionRow): { subject: string; text: string; fields: Record<string, string> } {
  // The form joined the URL qualifiers in its own order; the stored jsonb
  // keeps that order, so the line reads exactly as the form used to send it.
  const qualifiers = (row.qualifiers ?? {}) as Record<string, string>;
  const context = Object.entries(qualifiers)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const message = context ? `${row.message}\n\n[Context] ${context}` : row.message;
  const subject = `New enquiry from ${row.name}`;
  const text = [
    `Name: ${row.name}`,
    `Email: ${row.email}`,
    row.phone && `Phone: ${row.phone}`,
    row.company && `Company: ${row.company}`,
    row.budget && `Budget: ${row.budget}`,
    row.formService && `Service: ${row.formService}`,
    "",
    message,
  ]
    // filter(Boolean) exactly as before, so the delivered text is unchanged.
    .filter(Boolean)
    .join("\n");
  return {
    subject,
    text,
    // "Not given" rather than a dash: these values are spread into the
    // FormSubmit table template and land in a real email.
    fields: { name: row.name, email: row.email, phone: row.phone || "Not given", company: row.company || "Not given", budget: row.budget || "Not given", service: row.formService || "Not given", message },
  };
}

function recipient(): string {
  return process.env.CONTACT_TO || "s.shahzeb8874@gmail.com";
}

async function tryResend(row: SubmissionRow, key: string): Promise<void> {
  const from = process.env.CONTACT_FROM || "DevelMo Website <onboarding@resend.dev>";
  const { subject, text } = deliveryText(row);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: recipient(), reply_to: row.email, subject, text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
}

// The webhook keeps its pre-rewrite payload shape: the validated form
// fields (firstName, lastName, email, phone, company, budget, service,
// message with the [Context] line, consent) plus a subject. The stored row
// holds one name, so it is split on the first space.
async function tryWebhook(row: SubmissionRow, url: string): Promise<void> {
  const { subject, fields } = deliveryText(row);
  const [firstName, ...rest] = row.name.split(" ");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subject,
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      email: row.email,
      phone: row.phone,
      company: row.company,
      budget: row.budget,
      service: row.formService,
      message: fields.message,
      consent: true,
      submissionId: row.id,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Webhook error ${res.status}`);
}

async function tryFormSubmit(row: SubmissionRow): Promise<void> {
  const { subject, fields } = deliveryText(row);
  const res = await fetch(formSubmitUrl(recipient()), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ _subject: subject, _template: "table", _captcha: "false", _replyto: row.email, ...fields }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FormSubmit error ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { success?: string | boolean };
  if (json.success === "false" || json.success === false) throw new Error("FormSubmit rejected the submission");
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message;
    return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message;
  }
  return String(err);
}

// Runs the chain for a row. Never throws.
export async function runDeliveryChain(row: SubmissionRow): Promise<DeliveryOutcome> {
  if (qaAddress(row.email)) return { status: "skipped", channel: null, error: "QA address (@example.*), not delivered" };
  const errors: string[] = [];
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await tryResend(row, resendKey);
      return { status: "sent", channel: "resend", error: null };
    } catch (err) {
      errors.push(`resend: ${describe(err)}`);
    }
  }
  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      await tryWebhook(row, webhook);
      return { status: "sent", channel: "webhook", error: errors.length ? errors.join("; ") : null };
    } catch (err) {
      errors.push(`webhook: ${describe(err)}`);
    }
  }
  try {
    await tryFormSubmit(row);
    return { status: "sent", channel: "formsubmit", error: errors.length ? errors.join("; ") : null };
  } catch (err) {
    errors.push(`formsubmit: ${describe(err)}`);
  }
  return { status: "failed", channel: null, error: errors.join("; ") };
}

// Runs the chain for a stored row and records the outcome on it.
export async function deliverSubmission(id: string): Promise<DeliveryOutcome | null> {
  const db = getDb();
  const row = (await db.select().from(submissions).where(eq(submissions.id, id)).limit(1))[0];
  if (!row) return null;
  const outcome = await runDeliveryChain(row);
  const now = new Date();
  await db
    .update(submissions)
    .set({
      deliveryStatus: outcome.status,
      deliveryChannel: outcome.channel,
      deliveryError: outcome.error,
      deliveryAttempts: row.deliveryAttempts + 1,
      lastDeliveryAt: now,
      deliveredAt: outcome.status === "sent" ? now : row.deliveredAt,
      updatedAt: now,
    })
    .where(eq(submissions.id, id));
  return outcome;
}
