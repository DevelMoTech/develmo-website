import { NextResponse, type NextRequest } from "next/server";
import { recordAccessRequest } from "@/lib/auth/access-requests";
import { getClientIp, hashIp } from "@/lib/auth/ip";
import { securityEvent } from "@/lib/auth/log";
import { consumeLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { ACCESS_REQUEST_RECAPTCHA_ACTION, accessRequestSchema } from "@/lib/schemas/access";

export const runtime = "nodejs";

// The public half of the request-access flow. It creates a queue entry and
// nothing else: no account, no session, no invite. An Owner or Admin decides,
// and approval mints the same single-use invite the console mints by hand.
//
// The answer is deliberately the same in almost every case. A stranger must
// not be able to tell from it whether an address already has an account, or
// whether their honeypot or captcha failure was noticed.
const SAME_ANSWER = { ok: true as const, message: "Thanks. If your request is approved you will get an email with a link to set up your account." };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const ipHash = hashIp(ip);
  const userAgent = req.headers.get("user-agent");

  const limit = await consumeLimit("access_request", ip);
  if (limit.limited) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a filled hidden field means a bot. Recorded, then given the
  // same answer a person gets.
  if (typeof body.company_url === "string" && body.company_url.length > 0) {
    await securityEvent({ type: "honeypot", ipHash, path: "/api/access-request", userAgent, meta: { form: "access-request" } });
    return NextResponse.json(SAME_ANSWER);
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  }

  const captcha = await verifyRecaptcha(typeof body.recaptchaToken === "string" ? body.recaptchaToken : "", ip, ACCESS_REQUEST_RECAPTCHA_ACTION);
  if (!captcha.ok) {
    await securityEvent({ type: "captcha_rejected", ipHash, path: "/api/access-request", userAgent, meta: { reason: captcha.reason } });
    return NextResponse.json(
      { ok: false, code: "captcha", error: "Could not verify that you are human. Please refresh the page and try again." },
      { status: 400 },
    );
  }

  try {
    await recordAccessRequest(parsed.data, { ipHash, userAgent });
  } catch (err) {
    console.error("[access-request] could not store the request", err);
    return NextResponse.json({ ok: false, error: "Could not submit the request. Please try again." }, { status: 500 });
  }
  return NextResponse.json(SAME_ANSWER);
}
