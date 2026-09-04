import type { Metadata } from "next";
import { headers } from "next/headers";
import { PerformanceNav } from "@/app/(admin)/_components/performance/PerformanceNav";
import { AssetReport } from "@/app/(admin)/_components/performance/AssetReport";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { assetReport } from "@/lib/admin/performance";
import { requestBaseUrl } from "@/lib/auth/api";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Assets" };

// Asset weight (brief §3.8): everything in public/ plus uploaded media,
// with real byte sizes and what a mobile visitor pays for the heavy ones.
export default async function AssetsPage() {
  await requirePageUser("/admin/performance/assets", { permission: "performance:read" });
  const h = await headers();
  const report = await assetReport(requestBaseUrl(h));
  return (
    <>
      <PageHeader
        kicker="Performance"
        title="Assets"
        description="Every file the public site can ask a visitor to download, largest first, with what the heaviest cost on a mobile connection."
      />
      <PerformanceNav />
      <AssetReport rows={report.rows} note={report.note} />
    </>
  );
}
