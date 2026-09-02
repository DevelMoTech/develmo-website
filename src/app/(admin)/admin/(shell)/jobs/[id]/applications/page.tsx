import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { ApplicationsList } from "@/app/(admin)/_components/jobs/ApplicationsList";
import { Badge, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { fetchApplications, parseApplicationParams, staffOptions } from "@/app/(admin)/_lib/applications-query";
import { tableHref } from "@/app/(admin)/_lib/table";
import { loadJob } from "@/lib/admin/jobs";
import { requirePageUser } from "@/lib/auth/current";
import { STAGES } from "@/lib/schemas/job";

export const metadata: Metadata = { title: "Applications" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JobApplicationsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { user } = await requirePageUser(`/admin/jobs/${id}/applications`, { permission: "submissions:read" });
  if (!UUID.test(id)) notFound();
  const job = await loadJob(id);
  if (!job) notFound();
  const raw = await searchParams;
  const sp = { ...raw, job: id, assignee: raw.assignee === "me" ? user.id : raw.assignee };
  const tableParams = parseApplicationParams(sp);
  const [{ rows, total }, staff, stageRows] = await Promise.all([
    fetchApplications(tableParams, tableParams.pageSize, (tableParams.page - 1) * tableParams.pageSize),
    staffOptions(),
    getDb().select({ stage: applications.stage, n: sql<number>`count(*)::int` }).from(applications).where(eq(applications.jobId, id)).groupBy(applications.stage),
  ]);
  const counts = Object.fromEntries(stageRows.map((r) => [r.stage, r.n])) as Partial<Record<(typeof STAGES)[number], number>>;
  const basePath = `/admin/jobs/${id}/applications`;
  const shown = { ...parseApplicationParams(raw), filters: { ...parseApplicationParams(raw).filters } };
  delete shown.filters.job;
  const exportHref = tableHref("/api/admin/applications/export", { ...shown, filters: { ...shown.filters, job: id } }, { page: 1 }, { sort: "createdAt", dir: "desc" });

  return (
    <>
      <PageHeader
        kicker="Content"
        title={`Applications: ${job.title}`}
        description={
          <span className="adm-actions">
            {STAGES.map((s) => (
              <Badge key={s} tone={s === "hired" ? "ok" : s === "rejected" ? "danger" : "muted"}>{s} {counts[s] ?? 0}</Badge>
            ))}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/admin/jobs/${id}`}>Edit job</ButtonLink>
            <ButtonLink href="/admin/applications">All applications</ButtonLink>
          </>
        }
      />
      <ApplicationsList basePath={basePath} params={shown} rows={rows} total={total} showJob={false} staff={staff} exportHref={exportHref} />
    </>
  );
}
