import type { Metadata } from "next";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { CachePanel } from "@/app/(admin)/_components/performance/CachePanel";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { cacheTagRows } from "@/lib/admin/performance";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { listPublicRoutes } from "@/lib/seo/routes";

export const metadata: Metadata = { title: "Cache" };

// The manual escape hatch (brief §3.8). Publishing already busts the right
// tag; these buttons are for when a page is stale anyway.
export default async function CachePage() {
  const { allows } = await requirePageUser("/admin/performance/cache", { permission: "performance:read" });
  const [csrf, tags, routes] = await Promise.all([getCsrfToken(), cacheTagRows(), listPublicRoutes()]);
  return (
    <>
      <PageHeader
        kicker="Performance"
        title="Cache"
        description="What is cached behind which tag, when each was last invalidated, and the manual controls for when something is stale anyway."
      />
      <PerformanceNav />
      <CachePanel tags={tags} routes={routes.map((r) => r.path)} csrf={csrf} canWrite={allows("performance:write")} />
    </>
  );
}
