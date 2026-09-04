import type { Metadata } from "next";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { BuildPanel } from "@/app/(admin)/_components/performance/BuildPanel";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { buildView } from "@/lib/admin/performance";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Build" };

// Per-route client JS and the largest chunks, with a delta against the
// previously recorded build (brief §3.8).
export default async function BuildPage() {
  const { user } = await requirePageUser("/admin/performance/build", { permission: "performance:read" });
  const [csrf, view] = await Promise.all([getCsrfToken(), buildView()]);
  return (
    <>
      <PageHeader
        kicker="Performance"
        title="Build and bundles"
        description="Client JavaScript per route and the largest chunks, read from the build itself rather than estimated."
      />
      <PerformanceNav />
      <BuildPanel view={view} csrf={csrf} canRecord={can(user.role, "performance:write")} />
    </>
  );
}
