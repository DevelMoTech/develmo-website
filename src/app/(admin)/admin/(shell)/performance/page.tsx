import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts, vitalsStats } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage() {
  await requirePageUser("/admin/performance", { permission: "performance:read" });
  const [c, v] = await Promise.all([moduleCounts(), vitalsStats()]);
  return (
    <ModuleOverview
      kicker="Site"
      title="Performance"
      description="Real user Core Web Vitals per route, PageSpeed snapshots, asset weight, build stats and cache controls."
      icon="gauge"
      stats={[
        { label: "Vitals samples, 7 days", value: v.samples },
        { label: "Vitals samples, all time", value: c.vitals },
        { label: "LCP p75", value: v.lcp === null ? "n/a" : `${Math.round(v.lcp)} ms` },
      ]}
      empty={{
        title: "No field data yet",
        body: "Core Web Vitals are collected from real visitors once the public site reports them. Until then there is nothing to plot.",
      }}
    />
  );
}
