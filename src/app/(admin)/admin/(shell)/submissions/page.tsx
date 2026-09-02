import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { submissionStats } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Submissions" };

export default async function SubmissionsPage() {
  await requirePageUser("/admin/submissions", { permission: "submissions:read" });
  const s = await submissionStats();
  return (
    <ModuleOverview
      kicker="Inbox"
      title="Submissions"
      description="Every enquiry from the contact form, job applications and newsletter signups, with triage, notes and delivery status."
      icon="inbox"
      stats={[
        { label: "New", value: s.unread, hint: "unread" },
        { label: "All submissions", value: s.total, hint: `${s.spark.reduce((a, b) => a + b, 0)} in the last 7 days` },
        { label: "Spam", value: s.spam, hint: "honeypot and captcha rejections" },
      ]}
      empty={{
        title: "No submissions recorded yet",
        body: "The public contact form currently delivers straight to email. Once it writes to the database first, every enquiry lands here even when email delivery fails.",
        action: (
          <a className="adm-btn adm-btn-ghost adm-btn-sm" href="/contact-develmo" target="_blank" rel="noreferrer">
            Open the public contact form
          </a>
        ),
      }}
    />
  );
}
