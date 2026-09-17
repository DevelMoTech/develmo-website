import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, jobs } from "@/db/schema";
import { Badge, EmptyState, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { DataTable, TableFilters, type Column } from "@/app/(admin)/_components/ui/DataTable";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { parseTableParams } from "@/app/(admin)/_lib/table";
import { requirePageUser } from "@/lib/auth/current";
import { EMPLOYMENT_TYPES, labelFor, officeByCode } from "@/lib/jobs-shared";

export const metadata: Metadata = { title: "Jobs" };

const TABLE = {
  sortKeys: ["title", "status", "closesAt", "updatedAt"] as const,
  defaultSort: "updatedAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["status", "office"] as const,
};

type Row = typeof jobs.$inferSelect & { applicationCount: number };
const STATUS_TONE = { open: "ok", draft: "muted", paused: "warn", closed: "danger" } as const;

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { allows } = await requirePageUser("/admin/jobs", { permission: "content:read" });
  const canWrite = allows("content:write");
  const params = parseTableParams(await searchParams, TABLE);
  const clauses: SQL[] = [];
  if (params.filters.status && ["draft", "open", "paused", "closed"].includes(params.filters.status)) clauses.push(eq(jobs.status, params.filters.status as Row["status"]));
  if (params.filters.office) clauses.push(eq(jobs.officeCode, params.filters.office));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(jobs.title, needle), ilike(jobs.slug, needle), ilike(jobs.department, needle), ilike(jobs.location, needle))!);
  }
  const where = clauses.length ? and(...clauses) : undefined;
  const col = { title: jobs.title, status: jobs.status, closesAt: jobs.closesAt, updatedAt: jobs.updatedAt }[params.sort as "title" | "status" | "closesAt" | "updatedAt"];
  const db = getDb();
  const [rows, totalRow] = await Promise.all([
    db
      .select({ job: jobs, applicationCount: count(applications.id) })
      .from(jobs)
      .leftJoin(applications, eq(applications.jobId, jobs.id))
      .where(where)
      .groupBy(jobs.id)
      .orderBy(params.dir === "asc" ? asc(col) : desc(col))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(jobs).where(where),
  ]);
  const total = totalRow[0]?.n ?? 0;
  const items: Row[] = rows.map((r) => ({ ...r.job, applicationCount: r.applicationCount }));

  const columns: Column<Row>[] = [
    {
      key: "title",
      label: "Role",
      sortable: true,
      render: (r) => (
        <div>
          <Link href={`/admin/jobs/${r.id}`} className="adm-rowlink">{r.title}</Link>
          <div className="adm-help">{[r.department, r.location || officeByCode(r.officeCode)?.name, labelFor(EMPLOYMENT_TYPES, r.employmentType)].filter(Boolean).join(" · ")}</div>
        </div>
      ),
    },
    { key: "status", label: "Status", sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: "applications", label: "Applications", render: (r) => <Link href={`/admin/jobs/${r.id}/applications`} className="adm-link">{r.applicationCount}</Link> },
    { key: "closesAt", label: "Closes", sortable: true, render: (r) => fmt(r.closesAt) || <span className="adm-muted">open ended</span> },
    { key: "updatedAt", label: "Updated", sortable: true, render: (r) => fmt(r.updatedAt) },
  ];
  const filtered = Boolean(params.q) || Object.keys(params.filters).length > 0;

  return (
    <>
      <PageHeader
        kicker="Content"
        title="Jobs"
        description="Open roles published to /jobs and /jobs/<slug>, each with JobPosting structured data."
        actions={
          <>
            <ButtonLink href="/admin/jobs/templates"><Icon name="content" size={18} /> Email templates</ButtonLink>
            {canWrite && <ButtonLink href="/admin/jobs/new" variant="primary"><Icon name="plus" size={18} /> New job</ButtonLink>}
          </>
        }
      />
      <DataTable
        basePath="/admin/jobs"
        params={params}
        total={total}
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        caption="Jobs"
        toolbar={
          <TableFilters
            basePath="/admin/jobs"
            params={params}
            searchLabel="Search title, department or location"
            filters={[
              { key: "status", label: "Status", options: ["draft", "open", "paused", "closed"].map((v) => ({ value: v, label: v })) },
              { key: "office", label: "Office", options: [{ value: "UK", label: "United Kingdom" }, { value: "AU", label: "Australia" }, { value: "SA", label: "Saudi Arabia" }, { value: "PK", label: "Pakistan" }] },
            ]}
          />
        }
        empty={
          <EmptyState
            icon="jobs"
            title={total === 0 && !filtered ? "No jobs yet" : "No jobs match"}
            body={total === 0 && !filtered ? "Roles created here appear on the careers page as soon as they are opened." : "Try another search or clear the filters."}
            action={canWrite && !filtered ? <ButtonLink href="/admin/jobs/new" variant="primary"><Icon name="plus" size={18} /> New job</ButtonLink> : undefined}
          />
        }
      />
    </>
  );
}
