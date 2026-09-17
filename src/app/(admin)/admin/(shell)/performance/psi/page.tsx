import type { Metadata } from "next";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { PsiPanel } from "@/app/(admin)/_components/performance/PsiPanel";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listPsiRuns } from "@/lib/admin/performance";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { psiConfigured } from "@/lib/perf/psi";
import { listPublicRoutes } from "@/lib/seo/routes";

export const metadata: Metadata = { title: "PageSpeed" };

// On-demand PageSpeed Insights runs, stored as comparable snapshots
// (brief §3.8). The categories and opportunities are PSI's own.
export default async function PsiPage() {
  const { allows } = await requirePageUser("/admin/performance/psi", { permission: "performance:read" });
  const [csrf, runs, routes] = await Promise.all([getCsrfToken(), listPsiRuns(40), listPublicRoutes()]);
  return (
    <>
      <PageHeader
        kicker="Performance"
        title="PageSpeed Insights"
        description="Lab measurements from Google, run against a public URL on this deployment. Scores and opportunities are reported exactly as PSI returns them."
      />
      <PerformanceNav />
      <PsiPanel
        runs={runs}
        routes={routes.map((r) => r.path)}
        csrf={csrf}
        canRun={allows("performance:write")}
        configured={psiConfigured()}
      />
    </>
  );
}
