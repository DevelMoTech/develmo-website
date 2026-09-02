import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { submissions } from "@/db/schema";
import { createApplication, findOpenJob, sendAcknowledgement, storeCv } from "@/lib/admin/applications";
import { notifyInstantDigest } from "@/lib/submissions/digest";
import { getClientIp, hashIp } from "@/lib/auth/ip";
import { securityEvent } from "@/lib/auth/log";
import { MAX_CV_BYTES } from "@/lib/documents";
import { consumeLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { APPLY_RECAPTCHA_ACTION, applicationSchema } from "@/lib/schemas/job";
import { slugSchema } from "@/lib/schemas/post";
import { deleteObject } from "@/lib/storage";

export const runtime = "nodejs";

// Public job application (brief §3.4): the contact form's protections
// (durable rate limit, honeypot, optional reCAPTCHA), then the CV is sniffed
// from its bytes and stored under a private unguessable key. The row is
// written before the acknowledgement email is attempted, so a mail failure
// never loses an applicant.

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipHash = hashIp(ip);
  const userAgent = req.headers.get("user-agent");

  const limit = await consumeLimit("apply", ip);
  if (limit.limited) {
    return NextResponse.json(
      { ok: false, code: "rate_limited", error: "Too many requests. Please try again later." },
      { status: 429, headers: { "retry-after": String(retryAfterSeconds(limit)) } },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CV_BYTES + 64 * 1024) return fail(413, "cv_size", "The CV is too large.");

  const fd = await req.formData().catch(() => null);
  if (!fd) return fail(400, "invalid", "Invalid request.");
  const field = (k: string) => String(fd.get(k) ?? "");

  // Honeypot: a filled hidden field means a bot. Accept silently, record it.
  if (field("company_url").length > 0) {
    await securityEvent({ type: "honeypot", ipHash, path: "/api/jobs/apply", userAgent, meta: { form: "apply" } });
    return NextResponse.json({ ok: true });
  }

  const jobSlug = slugSchema.safeParse(field("jobSlug"));
  const parsed = applicationSchema.safeParse({
    name: field("name"),
    email: field("email"),
    phone: field("phone"),
    location: field("location"),
    linkedinUrl: field("linkedinUrl"),
    portfolioUrl: field("portfolioUrl"),
    coverNote: field("coverNote"),
    consent: field("consent") === "true" || field("consent") === "on",
    locale: field("locale") || "en",
  });
  if (!jobSlug.success || !parsed.success) {
    return fail(400, "invalid", parsed.success ? "Invalid request." : parsed.error.issues[0]?.message || "Invalid input.");
  }

  const job = await findOpenJob(jobSlug.data);
  if (!job) return fail(404, "job_closed", "This role is no longer open.");

  // The captcha round trip to Google runs only for a real, open role.
  const captcha = await verifyRecaptcha(field("recaptchaToken"), ip, APPLY_RECAPTCHA_ACTION);
  if (!captcha.ok) {
    await securityEvent({ type: "captcha_rejected", ipHash, path: "/api/jobs/apply", userAgent, meta: { reason: captcha.reason } });
    return fail(400, "captcha", "Could not verify that you are human. Please refresh the page and try again.");
  }

  const file = fd.get("cv");
  if (!(file instanceof File)) return fail(400, "cv_missing", "Please attach your CV.");
  const cv = await storeCv(file, { ipHash, userAgent, email: parsed.data.email });
  if (!cv.ok) {
    const status = cv.code === "cv_size" ? 413 : cv.code === "cv_type" ? 415 : 400;
    return fail(status, cv.code, cv.code === "cv_type" ? "The CV must be a PDF or DOCX file." : cv.code === "cv_size" ? "The CV is too large." : "Please attach your CV.");
  }

  let application;
  try {
    application = await createApplication(job, parsed.data, cv, { ipHash, userAgent });
  } catch (err) {
    console.error("[apply] insert failed", err);
    await deleteObject(cv.key).catch(() => {});
    return fail(502, "storage", "Could not save your application right now. Please email info@develmo.com.");
  }

  const app = application;
  after(async () => {
    try {
      await sendAcknowledgement(app, job);
    } catch (err) {
      console.error("[apply] acknowledgement failed", err);
    }
    // Staff on the instant digest hear about applications too (brief §3.5).
    try {
      const inbox = (await getDb().select().from(submissions).where(eq(submissions.applicationId, app.id)).limit(1))[0];
      if (inbox) await notifyInstantDigest(inbox);
    } catch (err) {
      console.error("[apply] instant digest failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
