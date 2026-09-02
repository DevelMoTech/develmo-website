import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { jobStats } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage() {
  await requirePageUser("/admin/jobs", { permission: "content:read" });
  const s = await jobStats();
  return (
    <ModuleOverview
      kicker="Content"
      title="Jobs"
      description="Open roles published to /jobs and /jobs/<slug>, each with JobPosting structured data."
      icon="jobs"
      stats={[
        { label: "Open roles", value: s.open },
        { label: "All jobs", value: s.total, hint: "draft, open, paused and closed" },
        { label: "Applications", value: s.applications, hint: `${s.newApplications} new` },
      ]}
      empty={{
        title: "No jobs yet",
        body: "Roles created here appear on the public careers page as soon as they are opened. Nothing is listed there today.",
        action: (
          <a className="adm-btn adm-btn-ghost adm-btn-sm" href="/jobs" target="_blank" rel="noreferrer">
            View the public careers page
          </a>
        ),
      }}
    />
  );
}
