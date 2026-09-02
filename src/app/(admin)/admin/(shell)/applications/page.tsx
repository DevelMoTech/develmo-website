import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { jobStats } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  await requirePageUser("/admin/applications", { permission: "submissions:read" });
  const s = await jobStats();
  return (
    <ModuleOverview
      kicker="Content"
      title="Applications"
      description="Applicants from the public job pages, with their CV, stage and notes."
      icon="applications"
      stats={[
        { label: "New", value: s.newApplications, hint: "awaiting screening" },
        { label: "All applications", value: s.applications },
        { label: "Open roles", value: s.open },
      ]}
      empty={{
        title: "No applications yet",
        body: "Applications arrive from the form on each public job page. There are no open roles to apply to right now.",
      }}
    />
  );
}
