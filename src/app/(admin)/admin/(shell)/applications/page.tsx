import type { Metadata } from "next";
import { ApplicationsList } from "@/app/(admin)/_components/jobs/ApplicationsList";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { fetchApplications, jobOptions, parseApplicationParams, staffOptions } from "@/app/(admin)/_lib/applications-query";
import { tableHref } from "@/app/(admin)/_lib/table";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Applications" };

// The applicant pipeline across every role (brief §3.4).
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/applications", { permission: "submissions:read" });
  const raw = await searchParams;
  const shown = parseApplicationParams(raw);
  const effective = parseApplicationParams({ ...raw, assignee: raw.assignee === "me" ? user.id : raw.assignee });
  const [{ rows, total }, staff, jobs] = await Promise.all([fetchApplications(effective, effective.pageSize, (effective.page - 1) * effective.pageSize), staffOptions(), jobOptions()]);
  const exportHref = tableHref("/api/admin/applications/export", shown, { page: 1 }, { sort: "createdAt", dir: "desc" });
  return (
    <>
      <PageHeader kicker="Content" title="Applications" description="Applicants from the public job pages, with their CV, stage, rating, assignee and notes." />
      <ApplicationsList basePath="/admin/applications" params={shown} rows={rows} total={total} showJob jobs={jobs} staff={staff} exportHref={exportHref} />
    </>
  );
}
