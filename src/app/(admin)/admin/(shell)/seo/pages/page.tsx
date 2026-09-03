import type { Metadata } from "next";
import { PagesManager } from "@/app/(admin)/_components/seo/PagesManager";
import { LocaleNote, SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { listRoutesWithOverrides } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "SEO pages" };

// Per-route overrides (brief §3.6): every public route, static and dynamic,
// with its title, description, canonical, Open Graph image and robots
// override, live counters and a SERP preview.
export default async function SeoPagesPage() {
  const { user } = await requirePageUser("/admin/seo/pages", { permission: "seo:read" });
  const [csrf, rows] = await Promise.all([getCsrfToken(), listRoutesWithOverrides()]);
  return (
    <>
      <PageHeader kicker="SEO" title="Pages" description={`${rows.length} public routes. A field left blank keeps the value written in the page file; an override is live on the next request.`} />
      <SeoNav />
      <LocaleNote />
      <PagesManager rows={rows} csrf={csrf} canWrite={can(user.role, "seo:write")} siteUrl={site.url} />
    </>
  );
}
