import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { submissions } from "@/db/schema";
import { contactSchema, type ContactInput } from "@/lib/contact-schema";
import { getClientIp, hashIp } from "@/lib/auth/ip";
import { securityEvent } from "@/lib/auth/log";
import { isLocale } from "@/lib/i18n";
import { consumeLimit } from "@/lib/ratelimit";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { deliverSubmission, qaAddress, runDeliveryChain, type SubmissionRow } from "@/lib/submissions/delivery";
import { notifyInstantDigest } from "@/lib/submissions/digest";

export const runtime = "nodejs";

// The contact form (brief §3.5). The enquiry is written to the database
// FIRST, then the delivery chain (Resend, webhook, FormSubmit) runs after the
// response and records its outcome on the row. A delivery failure never
// loses an enquiry and never shows the visitor an error. If the database
// itself is down, the chain runs synchronously as it did before this phase,
// so the enquiry still reaches the inbox by email; only when both fail does
// the visitor see the old "could not send" message.
//
// Unchanged from before: the durable limiter, the zod validation, the
// company_url honeypot (now stored as spam instead of discarded), the
// @example.* QA skip (now recorded as "skipped") and the optional captcha
// (rejections now stored as spam with the same visitor-facing answer).

const QUALIFIERS = ["service", "product", "industry", "intent", "source", "topic", "region"] as const;
type Qualifier = (typeof QUALIFIERS)[number];
const MAX_UTM_KEYS = 10;

// Optional attribution the form sends alongside the validated fields. Each
// field is read on its own, so one over-long value never drops the others.
const str = (max: number) => z.string().trim().max(max).catch("");
type Extras = { context: Record<string, string>; referrer: string; landingPage: string; utm: Record<string, string> };

function readExtras(body: Record<string, unknown>): Extras {
  const record = (v: unknown, max: number, cap: number): Record<string, string> => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      if (Object.keys(out).length >= cap) break;
      if (typeof raw !== "string" || !/^[a-z0-9_]{1,40}$/i.test(k)) continue;
      const val = raw.trim().slice(0, max);
      if (val) out[k] = val;
    }
    return out;
  };
  return {
    context: record(body.context, 120, 20),
    referrer: str(500).parse(body.referrer),
    landingPage: str(500).parse(body.landingPage),
    utm: record(body.utm, 200, MAX_UTM_KEYS),
  };
}

// Older clients append the qualifiers to the message as "[Context] k=v, k=v";
// read them from there when no structured context arrived.
function splitContext(message: string): { message: string; context: Record<string, string> } {
  const m = message.match(/\n\n\[Context\] ([^\n]*)$/);
  if (!m) return { message, context: {} };
  const context: Record<string, string> = {};
  for (const pair of m[1].split(",")) {
    const i = pair.indexOf("=");
    if (i > 0) context[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return { message: message.slice(0, m.index), context };
}

// The URL qualifiers in the order the form joins them, for the "[Context]"
// line of the delivery email.
function orderedQualifiers(context: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of QUALIFIERS) if (context[q]) out[q] = context[q].slice(0, 120);
  for (const [k, v] of Object.entries(context)) if (!(k in out) && v) out[k] = v.slice(0, 120);
  return out;
}

function qualifierColumns(context: Record<string, string>): Record<Qualifier, string> {
  const out = {} as Record<Qualifier, string>;
  for (const q of QUALIFIERS) out[q] = (context[q] ?? "").slice(0, 120);
  return out;
}

function localeFrom(req: Request): string {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)locale=([a-z]{2})/);
  return m && isLocale(m[1]) ? m[1] : "en";
}

function utmColumn(utm: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(utm)) if (/^utm_[a-z_]+$/i.test(k)) out[k.toLowerCase().replace(/^utm_/, "")] = v;
  return Object.keys(out).length ? out : null;
}

type StoreInput = {
  data: ContactInput;
  extras: Extras;
  context: Record<string, string>;
  message: string;
  spam: { reason: "honeypot" | "captcha"; detail?: string } | null;
  req: Request;
  ipHash: string;
};

function baseColumns(input: StoreInput) {
  const { data, extras, context, message, spam, req, ipHash } = input;
  // QA submissions (@example.*) are stored for the record but arrive already
  // read and tagged, so they never count as unread or trigger a digest.
  const qa = qaAddress(data.email);
  return {
    kind: "contact" as const,
    status: spam ? ("spam" as const) : qa ? ("read" as const) : ("new" as const),
    readAt: qa && !spam ? new Date() : null,
    tags: qa ? ["qa"] : [],
    name: `${data.firstName} ${data.lastName}`.trim(),
    email: data.email,
    phone: data.phone,
    company: data.company,
    message,
    budget: data.budget,
    formService: data.service,
    qualifiers: Object.keys(context).length ? orderedQualifiers(context) : null,
    ...qualifierColumns(context),
    // For filtering: the form's own service select, else the ?service qualifier.
    service: data.service || context.service || "",
    referrer: extras.referrer,
    landingPage: extras.landingPage,
    utm: utmColumn(extras.utm),
    locale: localeFrom(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? null,
    ipHash,
    isSpam: spam !== null,
    spamReason: spam?.reason ?? null,
    deliveryStatus: spam ? ("skipped" as const) : ("pending" as const),
    deliveryError: spam ? `Held as spam: ${spam.reason}${spam.detail ? ` (${spam.detail})` : ""}, not delivered` : null,
  };
}

async function storeSubmission(input: StoreInput): Promise<SubmissionRow> {
  const [row] = await getDb().insert(submissions).values(baseColumns(input)).returning();
  return row;
}

// A honeypot hit that also fails validation is still worth keeping: a
// best-effort row from whatever strings arrived, held as spam.
function bestEffort(body: Record<string, unknown>): ContactInput {
  const s = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
  return { firstName: s("firstName", 80) || "(unknown)", lastName: s("lastName", 80), email: s("email", 160) || "unknown@invalid", phone: s("phone", 40), company: s("company", 120), budget: s("budget", 60), service: s("service", 80), message: s("message", 4000), consent: false };
}

export async function POST(req: Request) {
  // Durable limiter (Upstash, or the database window): 5 per minute per IP
  // by default, editable at runtime from the security manager.
  const ip = getClientIp(req.headers);
  const ipHash = hashIp(ip);
  const limit = await consumeLimit("contact", ip);
  if (limit.limited) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again in a minute." },
      { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  const extras = readExtras(body);
  const honeypot = typeof body.company_url === "string" && body.company_url.length > 0;

  // Honeypot: a filled hidden field means a bot. The answer is still a silent
  // "ok"; the row is kept in the spam view instead of vanishing (brief §3.5).
  if (honeypot) {
    await securityEvent({ type: "honeypot", ipHash, path: "/api/contact", userAgent: req.headers.get("user-agent"), meta: { form: "contact" } });
    const data = parsed.success ? parsed.data : bestEffort(body);
    const { message, context } = splitContext(data.message);
    await storeSubmission({ data, extras, context: { ...context, ...extras.context }, message, spam: { reason: "honeypot", detail: parsed.success ? undefined : "invalid fields" }, req, ipHash }).catch((err) =>
      console.error("[contact] could not store honeypot row", err),
    );
    return NextResponse.json({ ok: true });
  }

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }
  const { message, context: fromMessage } = splitContext(parsed.data.message);
  const context = { ...fromMessage, ...extras.context };

  // Google reCAPTCHA v3 (active only when RECAPTCHA_SECRET_KEY is configured).
  // A rejection is stored as spam, with Google's reason, so a wrongly flagged
  // enquiry (or a whole outage) can be spotted and restored from the spam view.
  const captcha = await verifyRecaptcha(typeof body.recaptchaToken === "string" ? body.recaptchaToken : "", ip);
  if (!captcha.ok) {
    console.warn(`[contact] reCAPTCHA rejected (${captcha.reason})`);
    await securityEvent({ type: "captcha_rejected", ipHash, path: "/api/contact", userAgent: req.headers.get("user-agent"), meta: { reason: captcha.reason } });
    await storeSubmission({ data: parsed.data, extras, context, message, spam: { reason: "captcha", detail: captcha.reason }, req, ipHash }).catch((err) => console.error("[contact] could not store captcha row", err));
    // `code` lets the client show a localised message; `error` is the English fallback.
    return NextResponse.json(
      { ok: false, code: "captcha", error: "Could not verify that you are human. Please refresh the page and try again." },
      { status: 400 },
    );
  }

  // Database first. Then the chain runs after the response.
  let row: SubmissionRow | null = null;
  try {
    row = await storeSubmission({ data: parsed.data, extras, context, message, spam: null, req, ipHash });
  } catch (err) {
    console.error("[contact] database write failed, delivering directly", err);
  }

  if (row) {
    const stored = row;
    after(async () => {
      try {
        const outcome = await deliverSubmission(stored.id);
        if (outcome?.status === "failed") console.error(`[contact] delivery failed for ${stored.id}: ${outcome.error}`);
      } catch (err) {
        console.error("[contact] delivery chain crashed", stored.id, err);
      }
      await notifyInstantDigest(stored).catch((err) => console.error("[contact] instant digest failed", err));
    });
    return NextResponse.json({ ok: true });
  }

  // No database: the pre-rewrite behaviour, synchronous delivery.
  const transient: SubmissionRow = {
    ...baseColumns({ data: parsed.data, extras, context, message, spam: null, req, ipHash }),
    id: "unsaved",
    deliveryChannel: null,
    deliveryAttempts: 0,
    deliveredAt: null,
    lastDeliveryAt: null,
    assigneeId: null,
    applicationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const outcome = await runDeliveryChain(transient);
  if (outcome.status === "failed") {
    console.error("[contact] delivery failed with no database", outcome.error);
    return NextResponse.json({ ok: false, error: "Could not send right now. Please email info@develmo.com." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
