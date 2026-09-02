import { and, count, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, jobs } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { UserRow } from "@/lib/auth/session";
import { revalidateJobs } from "@/lib/repo/revalidate";
import type { JobInput } from "@/lib/schemas/job";

// Job mutations behind /api/admin/jobs/* (brief §3.4). Every write checks
// slug uniqueness, writes an audit row and revalidates the public board.

export type JobRow = typeof jobs.$inferSelect;
type Actor = { user: UserRow; ipHash: string | null };

export type JobError = { ok: false; code: "not_found" | "slug_taken" | "has_applications"; field?: string; count?: number };

export async function loadJob(id: string): Promise<JobRow | null> {
  return (await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1))[0] ?? null;
}

export async function jobSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const where = excludeId ? and(eq(jobs.slug, slug), ne(jobs.id, excludeId)) : eq(jobs.slug, slug);
  return (await getDb().select({ id: jobs.id }).from(jobs).where(where).limit(1)).length === 0;
}

// The editable columns, for audit before/after values.
function snapshot(row: JobRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of ["id", "createdAt", "updatedAt", "createdById", "updatedById"]) delete out[k];
  return out;
}

function columnsFrom(input: JobInput) {
  return {
    title: input.title,
    slug: input.slug,
    department: input.department,
    location: input.location,
    officeCode: input.officeCode,
    employmentType: input.employmentType,
    seniority: input.seniority,
    remotePolicy: input.remotePolicy,
    salaryMin: input.salaryMin,
    salaryMax: input.salaryMax,
    salaryCurrency: input.salaryCurrency,
    salaryPeriod: input.salaryPeriod,
    hideSalary: input.hideSalary,
    summaryMd: input.summaryMd,
    responsibilitiesMd: input.responsibilitiesMd,
    requirementsMd: input.requirementsMd,
    benefitsMd: input.benefitsMd,
    opensAt: input.opensAt,
    closesAt: input.closesAt,
    status: input.status,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    canonicalOverride: input.canonicalOverride,
    noindex: input.noindex,
  };
}

// datePosted for JobPosting: the first time the role goes live.
function openedAtFor(input: JobInput, previous: Date | null): Date | null {
  if (previous) return previous;
  if (input.status !== "open") return null;
  return input.opensAt ?? new Date();
}

export async function createJob(input: JobInput, actor: Actor): Promise<{ ok: true; id: string } | JobError> {
  if (!(await jobSlugAvailable(input.slug))) return { ok: false, code: "slug_taken", field: "slug" };
  const [row] = await getDb()
    .insert(jobs)
    .values({ ...columnsFrom(input), openedAt: openedAtFor(input, null), createdById: actor.user.id, updatedById: actor.user.id })
    .returning();
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: row.status === "open" ? "job.open" : "job.create", entityType: "job", entityId: row.id, after: snapshot(row), ipHash: actor.ipHash });
  revalidateJobs([row.slug]);
  return { ok: true, id: row.id };
}

export async function updateJob(input: JobInput & { id: string }, actor: Actor): Promise<{ ok: true } | JobError> {
  const before = await loadJob(input.id);
  if (!before) return { ok: false, code: "not_found" };
  if (!(await jobSlugAvailable(input.slug, input.id))) return { ok: false, code: "slug_taken", field: "slug" };
  const [after] = await getDb()
    .update(jobs)
    .set({ ...columnsFrom(input), openedAt: openedAtFor(input, before.openedAt), updatedById: actor.user.id, updatedAt: new Date() })
    .where(eq(jobs.id, input.id))
    .returning();
  const statusChanged = before.status !== after.status;
  const action = statusChanged ? `job.${after.status === "open" ? "open" : after.status === "closed" ? "close" : after.status === "paused" ? "pause" : "unpublish"}` : "job.update";
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action, entityType: "job", entityId: input.id, before: snapshot(before), after: snapshot(after), ipHash: actor.ipHash });
  revalidateJobs([before.slug, after.slug]);
  return { ok: true };
}

// A job with applications cannot be deleted (the rows are restricted); close
// it instead so the pipeline history stays intact.
export async function deleteJob(id: string, actor: Actor): Promise<{ ok: true } | JobError> {
  const row = await loadJob(id);
  if (!row) return { ok: false, code: "not_found" };
  const n = (await getDb().select({ n: count() }).from(applications).where(eq(applications.jobId, id)))[0]?.n ?? 0;
  if (n > 0) return { ok: false, code: "has_applications", count: n };
  await getDb().delete(jobs).where(eq(jobs.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "job.delete", entityType: "job", entityId: id, before: snapshot(row), ipHash: actor.ipHash });
  revalidateJobs([row.slug]);
  return { ok: true };
}

// Open roles whose closing time has passed: mark them closed. Called by the
// cron; the public board already hides them from the closing moment.
export async function closeDueJobs(): Promise<{ closed: string[] }> {
  const db = getDb();
  const due = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "open"), sql`${jobs.closesAt} <= now()`));
  const slugs: string[] = [];
  for (const row of due) {
    await db.update(jobs).set({ status: "closed", updatedAt: new Date() }).where(eq(jobs.id, row.id));
    await audit({ actorId: null, actorEmail: "cron", action: "job.close", entityType: "job", entityId: row.id, before: { status: "open" }, after: { status: "closed", reason: "closesAt passed" } });
    slugs.push(row.slug);
  }
  if (slugs.length) revalidateJobs(slugs);
  return { closed: slugs };
}
