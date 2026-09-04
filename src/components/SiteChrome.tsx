import { MegaNav } from "@/components/MegaNav";
import { SiteFooter } from "@/components/SiteFooter";
import { StickyCta } from "@/components/StickyCta";
import { TranslationOverrides } from "@/components/TranslationOverrides";
import { VisitCapture } from "@/components/VisitCapture";
import { WebVitals } from "@/components/WebVitals";
import { getLocale } from "@/lib/i18n-server";
import { jsonLd } from "@/lib/jsonld";
import { setTranslationOverrides } from "@/lib/i18n/overrides";
import { getTranslationOverrides } from "@/lib/repo/translations";
import { getOrganizationLd } from "@/lib/seo/organization-server";

// The public site chrome (header, footer, floating CTA, Organization JSON-LD).
// Used by the (site) route group layout and by the root not-found page, which
// renders outside that group for globally unmatched URLs.
//
// The Organization JSON-LD is built from the facts edited at /admin/seo/schema
// through the repo cache; without a saved document (or with the database
// down) it is the same markup the site shipped with, from src/lib/site.ts.

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const [locale, orgLd, overrides] = await Promise.all([getLocale(), getOrganizationLd(), getTranslationOverrides()]);
  // The server keeps the whole map: it is the same for every visitor, so one
  // module-level copy is correct and cannot race between concurrent requests
  // for different locales.
  setTranslationOverrides(overrides);
  // The client is sent only the locale it is rendering. Props reach the
  // browser through the RSC payload, so sending the whole map would put every
  // language into the source of every page.
  const forClient = locale === "en" || !overrides[locale] ? {} : { [locale]: overrides[locale] };
  return (
    <>
      <TranslationOverrides value={forClient} />
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
