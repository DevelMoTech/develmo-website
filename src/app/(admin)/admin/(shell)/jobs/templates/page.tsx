import type { Metadata } from "next";
import { TemplatesForm } from "@/app/(admin)/_components/jobs/TemplatesForm";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { ButtonLink } from "@/app/(admin)/_components/ui/Button";
import { getTemplate } from "@/lib/admin/templates";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Applicant email templates" };

export default async function TemplatesPage() {
  const { allows } = await requirePageUser("/admin/jobs/templates", { permission: "content:read" });
  const [csrf, application_ack, application_rejection] = await Promise.all([getCsrfToken(), getTemplate("application_ack"), getTemplate("application_rejection")]);
  return (
    <>
      <PageHeader kicker="Content" title="Applicant emails" description="The acknowledgement every applicant receives, and the rejection staff send by hand." actions={<ButtonLink href="/admin/jobs">Back to jobs</ButtonLink>} />
      <TemplatesForm csrf={csrf} initial={{ application_ack, application_rejection }} canWrite={allows("content:write")} />
    </>
  );
}
