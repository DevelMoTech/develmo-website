import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { JobEditor } from "@/app/(admin)/_components/jobs/JobEditor";
import { Badge, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { Icon } from "@/app/(admin)/_components/ui/Icon";
import { jobEditorValue } from "@/app/(admin)/_lib/job-editor-data";
import { loadJob } from "@/lib/admin/jobs";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { buildJobPosting, validateJobPosting } from "@/lib/jobposting";
import { markdownToHtml } from "@/lib/markdown";
import { toPublicJob } from "@/lib/repo/jobs";

export const metadata: Metadata = { title: "Edit job" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_TONE = { open: "ok", draft: "muted", paused: "warn", closed: "danger" } as const;

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePageUser(`/admin/jobs/${id}`, { permission: "content:read" });
  if (!UUID.test(id)) notFound();
  const row = await loadJob(id);
  if (!row) notFound();
  const [csrf, countRow] = await Promise.all([getCsrfToken(), getDb().select({ n: count() }).from(applications).where(eq(applications.jobId, id))]);
  const applicationCount = countRow[0]?.n ?? 0;
  // The same builder and validator the public page uses, so the editor shows
  // exactly what would (or would not) ship.
  const pub = toPublicJob(row);
  const descriptionMd = [pub.summaryMd, pub.responsibilitiesMd, pub.requirementsMd, pub.benefitsMd].filter(Boolean).join("\n\n");
  const report = validateJobPosting(buildJobPosting({ ...pub, validThrough: pub.closesAt }, await markdownToHtml(descriptionMd)));
  const live = row.status === "open";

  return (
    <>
      <PageHeader
        kicker="Content"
        title={row.title}
        description={
          <>
            <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>{" "}
            {live ? (
              <a className="adm-link" href={`/jobs/${row.slug}`} target="_blank" rel="noreferrer">
                /jobs/{row.slug} <Icon name="external" size={14} />
              </a>
            ) : (
              <span className="adm-mono">/jobs/{row.slug}</span>
            )}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/admin/jobs/${id}/applications`}><Icon name="applications" size={18} /> Applications ({applicationCount})</ButtonLink>
            <ButtonLink href="/admin/jobs">Back to jobs</ButtonLink>
          </>
        }
      />
      <JobEditor csrf={csrf} jobId={id} initial={jobEditorValue(row)} savedSlug={row.slug} canWrite={can(user.role, "content:write")} applicationCount={applicationCount} report={report} />
    </>
  );
}
