import type { Metadata } from "next";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { VitalsTable } from "@/app/(admin)/_components/performance/VitalsTable";
import { Card, PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { vitalsByRoute, vitalsSummary } from "@/lib/admin/performance";
import { requirePageUser } from "@/lib/auth/current";
import { formatMetric } from "@/lib/perf/vitals";

export const metadata: Metadata = { title: "Performance" };

// Core Web Vitals from real visitors (brief §3.8): p75 per route per device
// class, over a 7 or 28 day window.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("/admin/performance", { permission: "performance:read" });
  const sp = await searchParams;
  const days = sp.days === "28" ? 28 : 7;
  const [rows, summary] = await Promise.all([vitalsByRoute(days), vitalsSummary(days)]);

  return (
    <>
      <PageHeader
        kicker="Site"
        title="Core Web Vitals"
        description="Measured on this site, from real visits. A quarter of page views are sampled and reported to our own endpoint; no third party script is involved and nothing leaves this domain."
      />
      <PerformanceNav />
      {summary.samples === 0 ? (
        <Card
          title="No field data yet"
          description="Vitals arrive as real visitors browse the public site. Until then there is nothing to plot: this page shows measurements, never estimates."
        />
      ) : (
        <>
          <Card
            title={`${summary.samples.toLocaleString("en-GB")} samples across ${summary.routes} route${summary.routes === 1 ? "" : "s"}`}
            description={summary.worst ? `Furthest from its target: ${summary.worst.metric} on ${summary.worst.route}, p75 ${formatMetric(summary.worst.metric, summary.worst.p75)}.` : "Every metric with data is inside its good threshold."}
          />
          <VitalsTable rows={rows} days={days} />
        </>
      )}
    </>
  );
}
