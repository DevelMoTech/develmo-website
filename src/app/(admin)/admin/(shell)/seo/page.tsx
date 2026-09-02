import type { Metadata } from "next";
import { ModuleOverview } from "@/app/(admin)/_components/ModuleOverview";
import { moduleCounts } from "@/app/(admin)/_lib/stats";
import { requirePageUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoPage() {
  await requirePageUser("/admin/seo", { permission: "seo:read" });
  const c = await moduleCounts();
  return (
    <ModuleOverview
      kicker="Site"
      title="SEO"
      description="Per route metadata overrides, redirects, sitemap control, robots.txt and structured data. Cookie based locale means only English is indexed today."
      icon="seo"
      stats={[
        { label: "Metadata overrides", value: c.seoOverrides, hint: "pageMeta() falls back to the hardcoded values" },
        { label: "Database redirects", value: c.redirects, hint: "13 static redirects stay in next.config.ts" },
      ]}
      empty={{
        title: "No overrides or redirects yet",
        body: "Public routes currently serve the metadata written in their page files. Overrides created here take effect without a rebuild.",
      }}
    />
  );
}
