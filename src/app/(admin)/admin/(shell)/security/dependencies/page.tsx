import type { Metadata } from "next";
import { SecurityNav } from "@/app/(admin)/_components/security/SecurityNav";
import { DependencyPanel } from "@/app/(admin)/_components/security/DependencyPanel";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listDependencyRuns, SECURITY_PERMISSION } from "@/lib/admin/security";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Dependencies" };

// Dependency status (brief §3.7): the same question npm audit asks, put to
// the registry's advisory endpoint so it runs anywhere the site runs.
export default async function DependenciesPage() {
  await requirePageUser("/admin/security/dependencies", { permission: SECURITY_PERMISSION });
  const [csrf, runs] = await Promise.all([getCsrfToken(), listDependencyRuns(10)]);
  return (
    <>
      <PageHeader
        kicker="Security"
        title="Dependencies"
        description="Installed packages checked against the npm advisory database, daily from the cron and on demand here."
      />
      <SecurityNav />
      <DependencyPanel runs={runs} csrf={csrf} />
    </>
  );
}
