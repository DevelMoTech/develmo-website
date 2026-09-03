import type { Metadata } from "next";
import { SitemapManager } from "@/app/(admin)/_components/seo/SitemapManager";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getSitemapState, listSitemapRows } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Sitemap" };

// Sitemap control (brief §3.6): per route include or exclude, changefreq and
// priority, last generated time and regenerate now.
export default async function SitemapPage() {
  const { user } = await requirePageUser("/admin/seo/sitemap", { permission: "seo:read" });
  const [csrf, rows, state] = await Promise.all([getCsrfToken(), listSitemapRows(), getSitemapState()]);
  return (
    <>
      <PageHeader kicker="SEO" title="Sitemap" description={`${site.url}/sitemap.xml lists ${rows.filter((r) => r.included).length} of ${rows.length} public routes. /admin and /api are never included.`} />
      <SeoNav />
      <SitemapManager rows={rows} state={state} csrf={csrf} canWrite={can(user.role, "seo:write")} sitemapUrl={`${site.url}/sitemap.xml`} />
    </>
  );
}
