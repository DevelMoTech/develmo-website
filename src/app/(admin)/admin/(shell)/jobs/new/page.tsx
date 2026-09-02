import type { Metadata } from "next";
import { JobEditor } from "@/app/(admin)/_components/jobs/JobEditor";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { blankJobValue } from "@/app/(admin)/_lib/job-editor-data";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  await requirePageUser("/admin/jobs/new", { permission: "content:write" });
  const csrf = await getCsrfToken();
  return (
    <>
      <PageHeader kicker="Content" title="New job" description="Saved as a draft until you open it. Ctrl+S saves." actions={<ButtonLink href="/admin/jobs">Back to jobs</ButtonLink>} />
      <JobEditor csrf={csrf} jobId={null} initial={blankJobValue()} savedSlug={null} canWrite applicationCount={0} report={null} />
    </>
  );
}
