import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { applications, jobs, users } from "@/db/schema";
import { STAGES } from "@/lib/schemas/job";
import { parseTableParams, type TableParams } from "./table";

// URL-backed list state for the applicant pipeline, shared by the pages and
// the CSV export so both read the same filters.

export const APPLICATIONS_TABLE = {
  sortKeys: ["createdAt", "name", "stage", "rating", "job"] as const,
  defaultSort: "createdAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["stage", "job", "assignee"] as const,
};

const assignee = alias(users, "assignee");

export type ApplicationListRow = {
  id: string;
  name: string;
  email: string;
  stage: (typeof STAGES)[number];
  rating: number | null;
  createdAt: Date;
  location: string;
  cvFilename: string | null;
  jobId: string;
  jobTitle: string;
  jobSlug: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

export function parseApplicationParams(sp: Record<string, string | string[] | undefined>): TableParams {
  return parseTableParams(sp, APPLICATIONS_TABLE);
}

export async function fetchApplications(params: TableParams, limit: number, offset: number): Promise<{ rows: ApplicationListRow[]; total: number }> {
  const clauses: SQL[] = [];
  if (params.filters.stage && (STAGES as readonly string[]).includes(params.filters.stage)) clauses.push(eq(applications.stage, params.filters.stage as (typeof STAGES)[number]));
  if (params.filters.job && /^[0-9a-f-]{36}$/i.test(params.filters.job)) clauses.push(eq(applications.jobId, params.filters.job));
  // "none" = unassigned; the pages resolve "me" to the caller's id first.
  if (params.filters.assignee === "none") clauses.push(isNull(applications.assigneeId));
  else if (params.filters.assignee && /^[0-9a-f-]{36}$/i.test(params.filters.assignee)) clauses.push(eq(applications.assigneeId, params.filters.assignee));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(applications.name, needle), ilike(applications.email, needle), ilike(applications.location, needle), ilike(jobs.title, needle))!);
  }
  const where = clauses.length ? and(...clauses) : undefined;
  const sortCol = { createdAt: applications.createdAt, name: applications.name, stage: applications.stage, rating: applications.rating, job: jobs.title }[params.sort as "createdAt" | "name" | "stage" | "rating" | "job"] ?? applications.createdAt;
  const db = getDb();
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: applications.id,
        name: applications.name,
        email: applications.email,
        stage: applications.stage,
        rating: applications.rating,
        createdAt: applications.createdAt,
        location: applications.location,
        cvFilename: applications.cvFilename,
        jobId: applications.jobId,
        jobTitle: jobs.title,
        jobSlug: jobs.slug,
        assigneeId: applications.assigneeId,
        assigneeName: assignee.name,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(assignee, eq(applications.assigneeId, assignee.id))
      .where(where)
      .orderBy(params.dir === "asc" ? asc(sortCol) : desc(sortCol), desc(applications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(applications).innerJoin(jobs, eq(applications.jobId, jobs.id)).where(where),
  ]);
  return { rows, total: totalRow[0]?.n ?? 0 };
}

export async function staffOptions(): Promise<{ id: string; name: string }[]> {
  return getDb().select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
}

export async function jobOptions(): Promise<{ id: string; title: string; status: string }[]> {
  return getDb().select({ id: jobs.id, title: jobs.title, status: jobs.status }).from(jobs).orderBy(asc(jobs.title));
}
