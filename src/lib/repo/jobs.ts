import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs as jobsTable } from "@/db/schema";
import { repoQuery } from "./util";

// Public job board reads (brief §3.4, §5.1). There is no typed file of jobs:
// the site listed none before the dashboard, so the fallback is an empty
// board, which renders the careers page exactly as it was.

export type PublicJob = {
  id: string;
  slug: string;
  title: string;
  department: string;
  location: string;
  officeCode: string | null;
  employmentType: string;
  seniority: string;
  remotePolicy: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  hideSalary: boolean;
  summaryMd: string;
  responsibilitiesMd: string;
  requirementsMd: string;
  benefitsMd: string;
  // ISO date the role went live, and the closing datetime if any.
  datePosted: string;
  closesAt: string | null;
  updated: string;
  seo: { metaTitle: string | null; metaDescription: string | null; canonical: string | null; noindex: boolean };
};

type Row = typeof jobsTable.$inferSelect;

// Open, already opened, and not yet closed. A closing time in the past hides
// the role even before the cron marks it closed.
const visibleWhere = and(
  eq(jobsTable.status, "open"),
  or(isNull(jobsTable.opensAt), lte(jobsTable.opensAt, sql`now()`)),
  or(isNull(jobsTable.closesAt), gt(jobsTable.closesAt, sql`now()`)),
);

export function toPublicJob(r: Row): PublicJob {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    department: r.department,
    location: r.location,
    officeCode: r.officeCode,
    employmentType: r.employmentType,
    seniority: r.seniority,
    remotePolicy: r.remotePolicy,
    salaryMin: r.salaryMin,
    salaryMax: r.salaryMax,
    salaryCurrency: r.salaryCurrency,
    salaryPeriod: r.salaryPeriod,
    hideSalary: r.hideSalary,
    summaryMd: r.summaryMd,
    responsibilitiesMd: r.responsibilitiesMd,
    requirementsMd: r.requirementsMd,
    benefitsMd: r.benefitsMd,
    datePosted: (r.openedAt ?? r.opensAt ?? r.createdAt).toISOString().slice(0, 10),
    closesAt: r.closesAt?.toISOString() ?? null,
    updated: r.updatedAt.toISOString().slice(0, 10),
    seo: { metaTitle: r.metaTitle, metaDescription: r.metaDescription, canonical: r.canonicalOverride, noindex: r.noindex },
  };
}

export async function getOpenJobs(): Promise<PublicJob[]> {
  return repoQuery({
    keys: ["repo", "jobs", "open"],
    tags: ["jobs"],
    query: async () => {
      const rows = await getDb().select().from(jobsTable).where(visibleWhere).orderBy(asc(jobsTable.title));
      return rows.map(toPublicJob);
    },
    fallback: () => [],
  });
}

export async function getOpenJob(slug: string): Promise<PublicJob | undefined> {
  return repoQuery({
    keys: ["repo", "jobs", "by-slug", slug],
    tags: ["jobs", `job:${slug}`],
    query: async () => {
      const rows = await getDb()
        .select()
        .from(jobsTable)
        .where(and(visibleWhere, eq(jobsTable.slug, slug)))
        .limit(1);
      return rows[0] ? toPublicJob(rows[0]) : undefined;
    },
    fallback: () => undefined,
  });
}
