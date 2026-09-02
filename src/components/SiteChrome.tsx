import { MegaNav } from "@/components/MegaNav";
import { SiteFooter } from "@/components/SiteFooter";
import { StickyCta } from "@/components/StickyCta";
import { site } from "@/lib/site";
import { getLocale } from "@/lib/i18n-server";

// The public site chrome (header, footer, floating CTA, Organization JSON-LD).
// Used by the (site) route group layout and by the root not-found page, which
// renders outside that group for globally unmatched URLs.

const orgLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.name,
  url: site.url,
  email: site.email,
  description: site.description,
  address: {
    "@type": "PostalAddress",
    streetAddress: site.address.line,
    addressLocality: site.address.city,
    postalCode: site.address.postcode,
    addressCountry: "GB",
  },
  sameAs: site.social.map((s) => s.href),
};

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <MegaNav locale={locale} />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter locale={locale} />
      <StickyCta locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
    </>
  );
}
