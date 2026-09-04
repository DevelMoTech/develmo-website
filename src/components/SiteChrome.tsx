import { MegaNav } from "@/components/MegaNav";
import { SiteFooter } from "@/components/SiteFooter";
import { StickyCta } from "@/components/StickyCta";
import { VisitCapture } from "@/components/VisitCapture";
import { WebVitals } from "@/components/WebVitals";
import { getLocale } from "@/lib/i18n-server";
import { jsonLd } from "@/lib/jsonld";
import { getOrganizationLd } from "@/lib/seo/organization-server";

// The public site chrome (header, footer, floating CTA, Organization JSON-LD).
// Used by the (site) route group layout and by the root not-found page, which
// renders outside that group for globally unmatched URLs.
//
// The Organization JSON-LD is built from the facts edited at /admin/seo/schema
// through the repo cache; without a saved document (or with the database
// down) it is the same markup the site shipped with, from src/lib/site.ts.

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const [locale, orgLd] = await Promise.all([getLocale(), getOrganizationLd()]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <MegaNav locale={locale} />
      <VisitCapture />
      <WebVitals />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter locale={locale} />
      <StickyCta locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(orgLd) }}
      />
    </>
  );
}
