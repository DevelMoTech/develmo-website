import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { applicationEvents, applicationNotes, applications, jobs, submissions, users } from "@/db/schema";
import { audit, securityEvent } from "@/lib/auth/log";
import type { UserRow } from "@/lib/auth/session";
import { DOCUMENT_CONTENT_TYPES, MAX_CV_BYTES, sniffDocument } from "@/lib/documents";
import { sendEmail } from "@/lib/email";
import type { ApplicationInput } from "@/lib/schemas/job";
import { deleteObject, putObject, signedDownloadUrl } from "@/lib/storage";
import { getTemplate, renderTemplate } from "./templates";

// Applicant pipeline (brief §3.4): public submissions, stage changes with an
// audit trail, notes, ratings, assignment, signed CV downloads, emails.

export type ApplicationRow = typeof applications.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
type Actor = { user: UserRow; ipHash: string | null };

export type Stage = ApplicationRow["stage"];
export const STAGE_ORDER: Stage[] = ["new", "screening", "interview", "offer", "hired", "rejected"];

// The job must be open, inside its window, for a submission to land.
export async function findOpenJob(slug: string): Promise<JobRow | null> {
  const rows = await getDb()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.slug, slug),
        eq(jobs.status, "open"),
        or(isNull(jobs.opensAt), lte(jobs.opensAt, sql`now()`)),
        or(isNull(jobs.closesAt), gt(jobs.closesAt, sql`now()`)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type CvRejection = { ok: false; code: "cv_missing" | "cv_size" | "cv_type" };

// Sniffs and stores a CV under an unguessable private key.
export async function storeCv(file: File, ctx: { ipHash: string; userAgent: string | null; email: string }): Promise<{ ok: true; key: string; contentType: string; size: number; filename: string } | CvRejection> {
  if (file.size === 0) return { ok: false, code: "cv_missing" };
  if (file.size > MAX_CV_BYTES) return { ok: false, code: "cv_size" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniff = sniffDocument(bytes);
  if (!sniff.ok) {
    await securityEvent({
      type: "upload_rejected",
      email: ctx.email,
      ipHash: ctx.ipHash,
      path: "/api/jobs/apply",
      userAgent: ctx.userAgent,
      meta: { reason: sniff.reason, claimedType: file.type, name: file.name.slice(0, 120), size: file.size },
    });
    return { ok: false, code: "cv_type" };
  }
  const key = `cv-${randomBytes(16).toString("hex")}.${sniff.type}`;
  const contentType = DOCUMENT_CONTENT_TYPES[sniff.type];
  await putObject(key, bytes, contentType);
  const filename = file.name
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .trim()
    .slice(0, 150);
  return { ok: true, key, contentType, size: bytes.length, filename: filename.replace(/\.[a-z0-9]+$/i, "") + `.${sniff.type}` };
}

export async function createApplication(
  job: JobRow,
  input: ApplicationInput,
  cv: { key: string; contentType: string; size: number; filename: string },
  ctx: { ipHash: string; userAgent: string | null },
): Promise<ApplicationRow> {
  const [row] = await getDb()
    .insert(applications)
    .values({
      jobId: job.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      location: input.location,
      linkedinUrl: input.linkedinUrl,
      portfolioUrl: input.portfolioUrl,
      coverNote: input.coverNote,
      cvBlobKey: cv.key,
      cvFilename: cv.filename,
      cvContentType: cv.contentType,
      cvSize: cv.size,
      locale: input.locale,
      consentAt: new Date(),
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent?.slice(0, 512) ?? null,
    })
    .returning();
  await getDb().insert(applicationEvents).values({ applicationId: row.id, actorId: null, fromStage: null, toStage: "new", note: "Submitted through the careers page" });
  // Cross-link into the submissions inbox (brief §3.5): applications land
  // there too, with the pipeline as the place to act on them.
  await getDb()
    .insert(submissions)
    .values({
      kind: "application",
      status: "new",
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.coverNote,
      topic: job.title,
      source: "careers",
      locale: input.locale,
      userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      ipHash: ctx.ipHash,
      deliveryStatus: "skipped",
      deliveryError: "Application: the acknowledgement email is tracked on the application",
      applicationId: row.id,
    })
    .catch((err) => console.error("[applications] inbox cross-link failed", row.id, err));
  return row;
}

// Acknowledgement email, recorded on the row either way.
export async function sendAcknowledgement(app: ApplicationRow, job: JobRow): Promise<void> {
  const tpl = await getTemplate("application_ack");
  const vars = { name: app.name, job: job.title };
  const result = await sendEmail({ to: app.email, subject: renderTemplate(tpl.subject, vars), text: renderTemplate(tpl.body, vars) });
  await getDb()
    .update(applications)
    .set(result.sent ? { ackSentAt: new Date(), ackError: null } : { ackError: result.error ?? (result.skipped ? "RESEND_API_KEY not configured" : "not sent") })
    .where(eq(applications.id, app.id));
}

export async function loadApplication(id: string) {
  const db = getDb();
  const row = (await db.select({ app: applications, job: jobs }).from(applications).innerJoin(jobs, eq(applications.jobId, jobs.id)).where(eq(applications.id, id)).limit(1))[0];
  if (!row) return null;
  const [notes, events] = await Promise.all([
    db
      .select({ id: applicationNotes.id, body: applicationNotes.body, createdAt: applicationNotes.createdAt, authorId: applicationNotes.authorId, authorName: users.name })
      .from(applicationNotes)
      .leftJoin(users, eq(applicationNotes.authorId, users.id))
      .where(eq(applicationNotes.applicationId, id))
      .orderBy(desc(applicationNotes.createdAt)),
    db
      .select({ id: applicationEvents.id, fromStage: applicationEvents.fromStage, toStage: applicationEvents.toStage, note: applicationEvents.note, createdAt: applicationEvents.createdAt, actorName: users.name })
      .from(applicationEvents)
      .leftJoin(users, eq(applicationEvents.actorId, users.id))
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.createdAt)),
  ]);
  return { ...row, notes, events };
}

async function current(id: string): Promise<ApplicationRow | null> {
  return (await getDb().select().from(applications).where(eq(applications.id, id)).limit(1))[0] ?? null;
}

export async function changeStage(id: string, stage: Stage, note: string, actor: Actor): Promise<{ ok: true; changed: boolean } | { ok: false; code: "not_found" }> {
  const row = await current(id);
  if (!row) return { ok: false, code: "not_found" };
  if (row.stage === stage) return { ok: true, changed: false };
  const db = getDb();
  await db.update(applications).set({ stage, updatedAt: new Date() }).where(eq(applications.id, id));
  await db.insert(applicationEvents).values({ applicationId: id, actorId: actor.user.id, fromStage: row.stage, toStage: stage, note });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.stage", entityType: "application", entityId: id, before: { stage: row.stage }, after: { stage, note }, ipHash: actor.ipHash });
  return { ok: true, changed: true };
}

export async function setRating(id: string, rating: number | null, actor: Actor): Promise<boolean> {
  const row = await current(id);
  if (!row) return false;
  await getDb().update(applications).set({ rating, updatedAt: new Date() }).where(eq(applications.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.rate", entityType: "application", entityId: id, before: { rating: row.rating }, after: { rating }, ipHash: actor.ipHash });
  return true;
}

export async function assign(id: string, assigneeId: string | null, actor: Actor): Promise<{ ok: true } | { ok: false; code: "not_found" | "no_such_user" }> {
  const row = await current(id);
  if (!row) return { ok: false, code: "not_found" };
  if (assigneeId) {
    const u = (await getDb().select({ id: users.id }).from(users).where(and(eq(users.id, assigneeId), eq(users.status, "active"))).limit(1))[0];
    if (!u) return { ok: false, code: "no_such_user" };
  }
  await getDb().update(applications).set({ assigneeId, updatedAt: new Date() }).where(eq(applications.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.assign", entityType: "application", entityId: id, before: { assigneeId: row.assigneeId }, after: { assigneeId }, ipHash: actor.ipHash });
  return { ok: true };
}

export async function addNote(id: string, body: string, actor: Actor): Promise<{ id: string } | null> {
  const row = await current(id);
  if (!row) return null;
  const [note] = await getDb().insert(applicationNotes).values({ applicationId: id, authorId: actor.user.id, body }).returning({ id: applicationNotes.id });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.note", entityType: "application", entityId: id, after: { note: body.slice(0, 200) }, ipHash: actor.ipHash });
  return note;
}

// Manual rejection email from the editable template; moves the stage too.
export async function sendRejection(id: string, subject: string, body: string, actor: Actor): Promise<{ ok: true; sent: boolean; error?: string } | { ok: false; code: "not_found" }> {
  const loaded = await loadApplication(id);
  if (!loaded) return { ok: false, code: "not_found" };
  const vars = { name: loaded.app.name, job: loaded.job.title };
  const result = await sendEmail({ to: loaded.app.email, subject: renderTemplate(subject, vars), text: renderTemplate(body, vars) });
  if (result.sent) {
    await getDb().update(applications).set({ rejectionSentAt: new Date(), rejectionSentById: actor.user.id, updatedAt: new Date() }).where(eq(applications.id, id));
  }
  await changeStage(id, "rejected", result.sent ? "Rejection email sent" : `Rejection recorded, email not sent (${result.error ?? result.skipped ?? "unknown"})`, actor);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.reject_email", entityType: "application", entityId: id, after: { sent: result.sent, error: result.error ?? result.skipped ?? null }, ipHash: actor.ipHash });
  return { ok: true, sent: result.sent, error: result.error ?? (result.skipped ? "RESEND_API_KEY not configured" : undefined) };
}

export async function cvDownloadUrl(id: string): Promise<{ url: string; filename: string } | null> {
  const row = await current(id);
  if (!row?.cvBlobKey) return null;
  return { url: await signedDownloadUrl(row.cvBlobKey, 60), filename: row.cvFilename ?? row.cvBlobKey };
}

// Hard delete (retention, brief §3.5): removes the CV object as well.
export async function deleteApplication(id: string, actor: Actor): Promise<boolean> {
  const row = await current(id);
  if (!row) return false;
  // The inbox cross-link carries the same personal data: it goes too.
  await getDb().delete(submissions).where(eq(submissions.applicationId, id));
  await getDb().delete(applications).where(eq(applications.id, id));
  if (row.cvBlobKey) await deleteObject(row.cvBlobKey).catch((err) => console.error("[applications] cv delete failed", row.cvBlobKey, err));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.delete", entityType: "application", entityId: id, before: { name: row.name, email: row.email, jobId: row.jobId, stage: row.stage }, ipHash: actor.ipHash });
  return true;
}
