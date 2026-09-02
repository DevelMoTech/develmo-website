import type { Metadata } from "next";
import { RetentionForm, ReplyTemplateForm } from "@/app/(admin)/_components/submissions/InboxSettings";
import { SubmissionsList } from "@/app/(admin)/_components/submissions/SubmissionsList";
import { Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { tableHref } from "@/app/(admin)/_lib/table";
import { getSetting } from "@/lib/admin/settings";
import { fetchSubmissions, parseSubmissionParams, qualifierOptions, staffOptions } from "@/lib/admin/submissions";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Submissions" };

// The inbox (brief §3.5): every enquiry and application, with URL-backed
// filters, CSV export and, for settings holders, retention and the reply
// template.
export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePageUser("/admin/submissions", { permission: "submissions:read" });
  const raw = await searchParams;
  const shown = parseSubmissionParams(raw);
  const effective = parseSubmissionParams({ ...raw, assignee: raw.assignee === "me" ? user.id : raw.assignee });
  const canWrite = can(user.role, "submissions:write");
  const canSettings = can(user.role, "settings:write");
  const [csrf, { rows, total }, staff, options, retention, replyTemplate] = await Promise.all([
    getCsrfToken(),
    fetchSubmissions(effective, { spam: false, limit: effective.pageSize, offset: (effective.page - 1) * effective.pageSize }),
    staffOptions(),
    qualifierOptions(),
    getSetting("retention"),
    getSetting("reply_template"),
  ]);
  const exportHref = tableHref("/api/admin/submissions/export", shown, { page: 1 }, { sort: "createdAt", dir: "desc" });

  return (
    <>
      <PageHeader
        kicker="Inbox"
        title="Submissions"
        description="Every enquiry from the contact form and every job application, stored before any email is attempted."
        actions={<ButtonLink href="/admin/submissions/spam">Spam</ButtonLink>}
      />
      <SubmissionsList basePath="/admin/submissions" params={shown} rows={rows} total={total} spam={false} staff={staff} options={options} exportHref={exportHref} csrf={csrf} canWrite={canWrite} />
      {canSettings && (
        <div className="adm-grid" style={{ marginBlockStart: 22 }}>
          <Card title="Retention" description="How long enquiries, applications and CVs are kept before the cron removes them.">
            <RetentionForm csrf={csrf} initial={retention} />
          </Card>
          <Card title="Reply template" description="What the Reply by email button prefills.">
            <ReplyTemplateForm csrf={csrf} initial={replyTemplate} />
          </Card>
        </div>
      )}
    </>
  );
}
