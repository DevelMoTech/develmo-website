import type { Metadata } from "next";
import { SubmissionsList } from "@/app/(admin)/_components/submissions/SubmissionsList";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { tableHref } from "@/app/(admin)/_lib/table";
import { fetchSubmissions, parseSubmissionParams, qualifierOptions, staffOptions } from "@/lib/admin/submissions";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Spam" };

// Honeypot and captcha rejections, held instead of discarded (brief §3.5),
// with "not spam" to restore a row to the inbox.
export default async function SpamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/submissions/spam", { permission: "submissions:read" });
  const raw = await searchParams;
  const shown = parseSubmissionParams(raw);
  const effective = parseSubmissionParams({ ...raw, assignee: raw.assignee === "me" ? user.id : raw.assignee });
  const [csrf, { rows, total }, staff, options] = await Promise.all([
    getCsrfToken(),
    fetchSubmissions(effective, { spam: true, limit: effective.pageSize, offset: (effective.page - 1) * effective.pageSize }),
    staffOptions(),
    qualifierOptions(),
  ]);
  const exportHref = tableHref("/api/admin/submissions/export", { ...shown, filters: { ...shown.filters, view: "spam" } }, { page: 1 }, { sort: "createdAt", dir: "desc" });
  return (
    <>
      <PageHeader kicker="Inbox" title="Spam" description="Submissions the honeypot or the captcha rejected, and ones staff marked. Nothing here was delivered. Restore a genuine one with Not spam." actions={<ButtonLink href="/admin/submissions">Back to the inbox</ButtonLink>} />
      <SubmissionsList basePath="/admin/submissions/spam" params={shown} rows={rows} total={total} spam staff={staff} options={options} exportHref={exportHref} csrf={csrf} canWrite={can(user.role, "submissions:write")} />
    </>
  );
}
