import { NextResponse } from "next/server";
import { contactSchema, type ContactInput } from "@/lib/contact-schema";
import { verifyRecaptcha } from "@/lib/recaptcha";

export const runtime = "nodejs";

// Simple in-memory rate limit (per warm instance). For production scale,
// back this with Upstash/Redis via env. Good enough to stop basic abuse.
const hits = new Map<string, { count: number; ts: number }>();
function rateLimited(ip: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  const cur = hits.get(ip);
  if (!cur || now - cur.ts > windowMs) {
    hits.set(ip, { count: 1, ts: now });
    return false;
  }
  cur.count += 1;
  return cur.count > max;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again in a minute." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a filled hidden field means a bot. Accept silently, do nothing.
  if (typeof body.company_url === "string" && body.company_url.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || "Invalid input." },
      { status: 400 },
    );
  }

  // Google reCAPTCHA v3 (active only when RECAPTCHA_SECRET_KEY is configured).
  const captcha = await verifyRecaptcha(
    typeof body.recaptchaToken === "string" ? body.recaptchaToken : "",
    ip,
  );
  if (!captcha.ok) {
    console.warn(`[contact] reCAPTCHA rejected (${captcha.reason})`);
    // `code` lets the client show a localised message; `error` is the English fallback.
    return NextResponse.json(
      {
        ok: false,
        code: "captcha",
        error: "Could not verify that you are human. Please refresh the page and try again.",
      },
      { status: 400 },
    );
  }

  try {
    await deliver(parsed.data);
  } catch (err) {
    console.error("[contact] delivery failed", err);
    return NextResponse.json(
      { ok: false, error: "Could not send right now. Please email info@develmo.com." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

async function deliver(data: ContactInput) {
  const resendKey = process.env.RESEND_API_KEY;
  const webhook = process.env.CONTACT_WEBHOOK_URL;
  const to = process.env.CONTACT_TO || "s.shahzeb8874@gmail.com";
  const from = process.env.CONTACT_FROM || "DevelMo Website <onboarding@resend.dev>";

  const subject = `New enquiry from ${data.firstName} ${data.lastName}`;
  const lines = [
    `Name: ${data.firstName} ${data.lastName}`,
    `Email: ${data.email}`,
    data.phone && `Phone: ${data.phone}`,
    data.company && `Company: ${data.company}`,
    data.budget && `Budget: ${data.budget}`,
    data.service && `Service: ${data.service}`,
    "",
    data.message,
  ]
    .filter(Boolean)
    .join("\n");

  // Don't deliver automated QA submissions (reserved example.com domain).
  if (/@example\.(com|org|net)$/i.test(data.email)) {
    console.log(`[contact] test submission skipped -> ${to}`);
    return;
  }

  // 1) Resend (preferred for production once an API key + domain are set).
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, reply_to: data.email, subject, text: lines }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}`);
    return;
  }

  // 2) Custom webhook if configured.
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, ...data }),
    });
    if (!res.ok) throw new Error(`Webhook error ${res.status}`);
    return;
  }

  // 3) Default: FormSubmit (no account/key needed). The first real submission
  //    triggers a one-time activation email to `to`; click it once to enable.
  const res = await fetch(`https://formsubmit.co/ajax/${to}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      _subject: subject,
      _template: "table",
      _captcha: "false",
      _replyto: data.email,
      name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      phone: data.phone || "—",
      company: data.company || "—",
      budget: data.budget || "—",
      service: data.service || "—",
      message: data.message,
    }),
  });
  if (!res.ok) throw new Error(`FormSubmit error ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { success?: string | boolean };
  if (json.success === "false" || json.success === false) {
    throw new Error("FormSubmit rejected the submission");
  }
}
