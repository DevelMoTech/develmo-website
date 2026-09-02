import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { applications, submissionNotes, submissions, users } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { UserRow } from "@/lib/auth/session";
import { deleteObject } from "@/lib/storage";
import { deliverSubmission, type DeliveryOutcome, type SubmissionRow } from "@/lib/submissions/delivery";
import { parseTableParams, type TableParams } from "@/app/(admin)/_lib/table";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/schemas/submission";
import { getSettingStrict } from "./settings";

// Submissions inbox (brief §3.5): URL-backed listing shared by the pages and
// the CSV export, triage mutations with audit rows, spam handling, replay,
// hard delete, the delivery retry sweep and the retention purge.

export type { SubmissionRow };
type Actor = { user: UserRow; ipHash: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SUBMISSIONS_TABLE = {
  sortKeys: ["createdAt", "name", "status", "kind", "delivery"] as const,
  defaultSort: "createdAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["status", "kind", "assignee", "service", "intent", "industry", "delivery", "from", "to", "tag"] as const,
};

const assignee = alias(users, "assignee");

export type SubmissionListRow = {
  id: string;
  kind: SubmissionRow["kind"];
  status: SubmissionStatus;
  name: string;
  email: string;
  company: string;
  service: string;
  intent: string;
  industry: string;
  tags: string[];
  deliveryStatus: SubmissionRow["deliveryStatus"];
  deliveryChannel: string | null;
  spamReason: string | null;
  createdAt: Date;
  assigneeId: string | null;
  assigneeName: string | null;
  applicationId: string | null;
};

export function parseSubmissionParams(sp: Record<string, string | string[] | undefined>): TableParams {
  return parseTableParams(sp, SUBMISSIONS_TABLE);
}

function dateBound(v: string | undefined, endOfDay: boolean): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchSubmissions(params: TableParams, opts: { spam: boolean; limit: number; offset: number }): Promise<{ rows: SubmissionListRow[]; total: number }> {
  const f = params.filters;
  const clauses: SQL[] = [eq(submissions.isSpam, opts.spam)];
  if (f.status && (SUBMISSION_STATUSES as readonly string[]).includes(f.status)) clauses.push(eq(submissions.status, f.status as SubmissionStatus));
  if (f.kind && ["contact", "application", "newsletter"].includes(f.kind)) clauses.push(eq(submissions.kind, f.kind as SubmissionRow["kind"]));
  if (f.assignee === "none") clauses.push(isNull(submissions.assigneeId));
  else if (f.assignee && UUID.test(f.assignee)) clauses.push(eq(submissions.assigneeId, f.assignee));
  if (f.service) clauses.push(ilike(submissions.service, f.service));
  if (f.intent) clauses.push(ilike(submissions.intent, f.intent));
  if (f.industry) clauses.push(ilike(submissions.industry, f.industry));
  if (f.delivery && ["pending", "sent", "failed", "skipped"].includes(f.delivery)) clauses.push(eq(submissions.deliveryStatus, f.delivery as SubmissionRow["deliveryStatus"]));
  if (f.tag) clauses.push(sql`${f.tag.toLowerCase()} = any(${submissions.tags})`);
  const from = dateBound(f.from, false);
  const to = dateBound(f.to, true);
  if (from) clauses.push(gte(submissions.createdAt, from));
  if (to) clauses.push(lte(submissions.createdAt, to));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(submissions.name, needle), ilike(submissions.email, needle), ilike(submissions.company, needle), ilike(submissions.message, needle), ilike(submissions.phone, needle))!);
  }
  const where = and(...clauses);
  const sortCol = { createdAt: submissions.createdAt, name: submissions.name, status: submissions.status, kind: submissions.kind, delivery: submissions.deliveryStatus }[params.sort as "createdAt" | "name" | "status" | "kind" | "delivery"] ?? submissions.createdAt;
  const db = getDb();
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: submissions.id,
        kind: submissions.kind,
        status: submissions.status,
        name: submissions.name,
        email: submissions.email,
        company: submissions.company,
        service: submissions.service,
        intent: submissions.intent,
        industry: submissions.industry,
        tags: submissions.tags,
        deliveryStatus: submissions.deliveryStatus,
        deliveryChannel: submissions.deliveryChannel,
        spamReason: submissions.spamReason,
        createdAt: submissions.createdAt,
        assigneeId: submissions.assigneeId,
        assigneeName: assignee.name,
        applicationId: submissions.applicationId,
      })
      .from(submissions)
      .leftJoin(assignee, eq(submissions.assigneeId, assignee.id))
      .where(where)
      .orderBy(params.dir === "asc" ? asc(sortCol) : desc(sortCol), desc(submissions.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ n: count() }).from(submissions).where(where),
  ]);
  return { rows, total: totalRow[0]?.n ?? 0 };
}

// Distinct qualifier values for the filter selects: inbox rows only (spam is
// visitor-controlled noise), capped so a flood cannot bloat the dropdowns.
export async function qualifierOptions(): Promise<{ services: string[]; intents: string[]; industries: string[]; tags: string[] }> {
  const db = getDb();
  const live = eq(submissions.isSpam, false);
  const CAP = 50;
  const [s, i, ind, t] = await Promise.all([
    db.selectDistinct({ v: submissions.service }).from(submissions).where(and(live, sql`${submissions.service} <> ''`)).orderBy(asc(submissions.service)).limit(CAP),
    db.selectDistinct({ v: submissions.intent }).from(submissions).where(and(live, sql`${submissions.intent} <> ''`)).orderBy(asc(submissions.intent)).limit(CAP),
    db.selectDistinct({ v: submissions.industry }).from(submissions).where(and(live, sql`${submissions.industry} <> ''`)).orderBy(asc(submissions.industry)).limit(CAP),
    db.execute<{ tag: string }>(sql`select distinct unnest(${submissions.tags}) as tag from ${submissions} where ${submissions.isSpam} = false order by tag limit ${CAP}`),
  ]);
  return { services: s.map((r) => r.v), intents: i.map((r) => r.v), industries: ind.map((r) => r.v), tags: (t.rows as { tag: string }[]).map((r) => r.tag) };
}

export type NoteRow = { id: string; body: string; parentId: string | null; createdAt: Date; authorName: string | null };

export async function loadSubmission(id: string) {
  const db = getDb();
  const row = (await db.select().from(submissions).where(eq(submissions.id, id)).limit(1))[0];
  if (!row) return null;
  const notes = await db
    .select({ id: submissionNotes.id, body: submissionNotes.body, parentId: submissionNotes.parentId, createdAt: submissionNotes.createdAt, authorName: users.name })
    .from(submissionNotes)
    .leftJoin(users, eq(submissionNotes.authorId, users.id))
    .where(eq(submissionNotes.submissionId, id))
    .orderBy(asc(submissionNotes.createdAt));
  const application = row.applicationId ? (await db.select({ id: applications.id, stage: applications.stage, jobId: applications.jobId }).from(applications).where(eq(applications.id, row.applicationId)).limit(1))[0] ?? null : null;
  return { row, notes: notes as NoteRow[], application };
}

// Opening a new submission marks it read (an inbox convention), audited like
// any other status change, but only when the update actually happened.
export async function markRead(id: string, actor: Actor): Promise<void> {
  const changed = await getDb()
    .update(submissions)
    .set({ status: "read", readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.status, "new")))
    .returning({ id: submissions.id });
  if (changed.length === 0) return;
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "submission.read", entityType: "submission", entityId: id, before: { status: "new" }, after: { status: "read" }, ipHash: actor.ipHash });
}

// The pipeline is where applications are acted on; opening one there marks
// its inbox mirror read so the badge reflects reality.
export async function markReadForApplication(applicationId: string, actor: Actor): Promise<void> {
  const rows = await getDb().select({ id: submissions.id }).from(submissions).where(and(eq(submissions.applicationId, applicationId), eq(submissions.status, "new"))).limit(1);
  if (rows[0]) await markRead(rows[0].id, actor);
}

export async function updateSubmission(input: { id: string; status?: SubmissionStatus; assigneeId?: string | null; tags?: string[] }, actor: Actor): Promise<{ ok: true; delivery: DeliveryOutcome | null } | { ok: false; code: "not_found" | "no_such_user" }> {
  const db = getDb();
  const before = (await db.select().from(submissions).where(eq(submissions.id, input.id)).limit(1))[0];
  if (!before) return { ok: false, code: "not_found" };
  if (input.assigneeId) {
    const u = (await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.status, "active"))).limit(1))[0];
    if (!u) return { ok: false, code: "no_such_user" };
  }
  const patch: Partial<SubmissionRow> = { updatedAt: new Date() };
  let restored = false;
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "spam") {
      patch.isSpam = true;
      patch.spamReason = "manual";
    } else if (before.isSpam) {
      patch.isSpam = false;
      patch.spamReason = null;
      restored = true;
    }
    if (before.status === "new" && input.status !== "new") patch.readAt = before.readAt ?? new Date();
  }
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.tags !== undefined) patch.tags = input.tags;
  await db.update(submissions).set(patch).where(eq(submissions.id, input.id));
  const changed = Object.fromEntries(Object.keys(patch).filter((k) => k !== "updatedAt").map((k) => [k, (before as Record<string, unknown>)[k]]));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: input.status && input.status !== before.status ? "submission.status" : input.assigneeId !== undefined ? "submission.assign" : "submission.tags", entityType: "submission", entityId: input.id, before: changed, after: Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "updatedAt")), ipHash: actor.ipHash });
  // A held enquiry lifted out of spam by a status change is delivered now,
  // the same as "Not spam".
  const delivery = restored && before.kind === "contact" && before.deliveryStatus !== "sent" ? await deliverSubmission(input.id) : null;
  return { ok: true, delivery };
}

export async function addSubmissionNote(input: { id: string; body: string; parentId?: string | null }, actor: Actor): Promise<{ id: string } | null> {
  const db = getDb();
  const row = (await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.id, input.id)).limit(1))[0];
  if (!row) return null;
  if (input.parentId) {
    // One level of replies: the parent must be a top-level note of this submission.
    const parent = (await db.select({ id: submissionNotes.id, parentId: submissionNotes.parentId }).from(submissionNotes).where(and(eq(submissionNotes.id, input.parentId), eq(submissionNotes.submissionId, input.id))).limit(1))[0];
    if (!parent || parent.parentId) return null;
  }
  const [note] = await db.insert(submissionNotes).values({ submissionId: input.id, authorId: actor.user.id, parentId: input.parentId ?? null, body: input.body }).returning({ id: submissionNotes.id });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "submission.note", entityType: "submission", entityId: input.id, after: { note: input.body.slice(0, 200), parentId: input.parentId ?? null }, ipHash: actor.ipHash });
  return note;
}

// Spam toggle. Restoring a row that was held before delivery runs the chain
// now, so a wrongly flagged enquiry still reaches the inbox email. A row
// already in the requested state is left alone.
export async function setSpam(id: string, spam: boolean, actor: Actor): Promise<{ ok: true; delivery: DeliveryOutcome | null; changed: boolean } | { ok: false; code: "not_found" }> {
  const db = getDb();
  const before = (await db.select().from(submissions).where(eq(submissions.id, id)).limit(1))[0];
  if (!before) return { ok: false, code: "not_found" };
  if (before.isSpam === spam) return { ok: true, delivery: null, changed: false };
  await db
    .update(submissions)
    .set(spam ? { isSpam: true, spamReason: "manual", status: "spam", updatedAt: new Date() } : { isSpam: false, spamReason: null, status: "new", readAt: null, updatedAt: new Date() })
    .where(eq(submissions.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: spam ? "submission.spam" : "submission.not_spam", entityType: "submission", entityId: id, before: { isSpam: before.isSpam, spamReason: before.spamReason, status: before.status }, after: { isSpam: spam, status: spam ? "spam" : "new" }, ipHash: actor.ipHash });
  let delivery: DeliveryOutcome | null = null;
  if (!spam && before.kind === "contact" && before.deliveryStatus !== "sent") delivery = await deliverSubmission(id);
  return { ok: true, delivery, changed: true };
}

// Manual replay: contact enquiries only, never a held spam row.
export async function replayDelivery(id: string, actor: Actor): Promise<DeliveryOutcome | null | "not_deliverable"> {
  const row = (await getDb().select({ kind: submissions.kind, isSpam: submissions.isSpam }).from(submissions).where(eq(submissions.id, id)).limit(1))[0];
  if (!row) return null;
  if (row.kind !== "contact" || row.isSpam) return "not_deliverable";
  const outcome = await deliverSubmission(id);
  if (outcome) await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "submission.replay", entityType: "submission", entityId: id, after: outcome, ipHash: actor.ipHash });
  return outcome;
}

// Cron sweep: a row still "pending" a few minutes after arrival means the
// after() delivery never ran to completion (cut-off callback, crash), and a
// "failed" row gets up to three automatic attempts before staff decide.
export async function retryPendingDeliveries(now = new Date()): Promise<{ retried: number; sent: number }> {
  const db = getDb();
  const stale = new Date(now.getTime() - 5 * 60 * 1000);
  const rows = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.kind, "contact"),
        eq(submissions.isSpam, false),
        or(and(eq(submissions.deliveryStatus, "pending"), lt(submissions.createdAt, stale)), and(eq(submissions.deliveryStatus, "failed"), lt(submissions.deliveryAttempts, 3), lt(submissions.lastDeliveryAt, stale))),
      ),
    )
    .limit(50);
  let sent = 0;
  for (const r of rows) {
    const outcome = await deliverSubmission(r.id);
    if (outcome?.status === "sent") sent += 1;
  }
  if (rows.length) await audit({ actorId: null, actorEmail: "cron", action: "submission.retry", entityType: "submission", after: { retried: rows.length, sent } });
  return { retried: rows.length, sent };
}

// Hard delete (a data removal request). For an application's inbox row the
// pipeline record and its CV object go too: the request is about the
// person, not the row.
export async function deleteSubmission(id: string, actor: Actor): Promise<boolean> {
  const db = getDb();
  const row = (await db.select().from(submissions).where(eq(submissions.id, id)).limit(1))[0];
  if (!row) return false;
  await db.delete(submissions).where(eq(submissions.id, id));
  if (row.applicationId) {
    const app = (await db.select({ id: applications.id, cvBlobKey: applications.cvBlobKey, name: applications.name, email: applications.email, stage: applications.stage }).from(applications).where(eq(applications.id, row.applicationId)).limit(1))[0];
    if (app) {
      await db.delete(applications).where(eq(applications.id, app.id));
      if (app.cvBlobKey) await deleteObject(app.cvBlobKey).catch((err) => console.error("[submissions] cv delete failed", app.cvBlobKey, err));
      await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "application.delete", entityType: "application", entityId: app.id, before: { name: app.name, email: app.email, stage: app.stage, via: "inbox" }, ipHash: actor.ipHash });
    }
  }
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "submission.delete", entityType: "submission", entityId: id, before: { kind: row.kind, name: row.name, email: row.email, status: row.status, createdAt: row.createdAt, applicationId: row.applicationId }, ipHash: actor.ipHash });
  return true;
}

// `months` calendar months before `now`, clamped to the last day of the
// target month so a 31st never rolls forward into the following month.
export function monthsBefore(now: Date, months: number): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(now.getUTCDate(), lastDay), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
}

// Retention (brief §3.5): hard-delete submissions and applications older
// than the configured windows. Applications take their inbox mirrors and CV
// objects with them. Called by the cron; each run is one audit row per kind.
// If the setting cannot be read the purge does not run: a default must never
// delete what the owner configured to keep.
export async function purgeExpired(now = new Date()): Promise<{ submissions: number; applications: number; skipped?: string }> {
  let retention;
  try {
    retention = await getSettingStrict("retention");
  } catch (err) {
    console.error("[retention] setting unreadable, purge skipped", err);
    return { submissions: 0, applications: 0, skipped: "retention setting unreadable" };
  }
  const db = getDb();
  let removedSubmissions = 0;
  let removedApplications = 0;
  if (retention.submissionsMonths > 0) {
    const old = await db.delete(submissions).where(and(lt(submissions.createdAt, monthsBefore(now, retention.submissionsMonths)), isNull(submissions.applicationId))).returning({ id: submissions.id });
    removedSubmissions = old.length;
    if (old.length) await audit({ actorId: null, actorEmail: "cron", action: "submission.purge", entityType: "submission", after: { removed: old.length, olderThanMonths: retention.submissionsMonths } });
  }
  if (retention.applicationsMonths > 0) {
    const old = await db.select({ id: applications.id, cvBlobKey: applications.cvBlobKey }).from(applications).where(lt(applications.createdAt, monthsBefore(now, retention.applicationsMonths)));
    if (old.length) {
      const ids = old.map((o) => o.id);
      await db.delete(submissions).where(inArray(submissions.applicationId, ids));
      await db.delete(applications).where(inArray(applications.id, ids));
      for (const o of old) if (o.cvBlobKey) await deleteObject(o.cvBlobKey).catch((err) => console.error("[retention] cv delete failed", o.cvBlobKey, err));
      removedApplications = old.length;
      await audit({ actorId: null, actorEmail: "cron", action: "application.purge", entityType: "application", after: { removed: old.length, olderThanMonths: retention.applicationsMonths } });
    }
  }
  return { submissions: removedSubmissions, applications: removedApplications };
}

export async function staffOptions(): Promise<{ id: string; name: string }[]> {
  return getDb().select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
}
