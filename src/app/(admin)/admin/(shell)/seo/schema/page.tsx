import type { Metadata } from "next";
import { FaqToggles, OrganizationEditor } from "@/app/(admin)/_components/seo/SchemaEditor";
import { SeoNav } from "@/app/(admin)/_components/seo/SeoNav";
import { PageHeader } from "@/app/(admin)/_components/ui/Basics";
import { getSetting } from "@/lib/admin/settings";
import { listRoutesWithOverrides } from "@/lib/admin/seo";
import { getCsrfToken, requirePageUser } from "@/lib/auth/current";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Structured data" };

// Structured data (brief §3.6): the Organization JSON-LD the site chrome
// emits, edited through its facts and validated before save, and the
// FAQPage toggle per detail page.
export default async function SchemaPage() {
  const { allows } = await requirePageUser("/admin/seo/schema", { permission: "seo:read" });
  const [csrf, facts, routes] = await Promise.all([getCsrfToken(), getSetting("org_schema"), listRoutesWithOverrides()]);
  const faqRoutes = routes.filter((r) => r.hasFaq).map((r) => ({ path: r.path, label: r.label, kind: r.kind, enabled: r.override?.faqEnabled !== false }));
  const canWrite = allows("seo:write");
  return (
    <>
      <PageHeader kicker="SEO" title="Structured data" description="The Organization JSON-LD on every public page, and FAQPage on the detail pages that have FAQs." />
      <SeoNav />
      <OrganizationEditor initial={facts} csrf={csrf} canWrite={canWrite} sameAs={site.social.map((s) => ({ name: s.name, href: s.href }))} siteUrl={site.url} />
      <FaqToggles routes={faqRoutes} csrf={csrf} canWrite={canWrite} />
    </>
  );
}
