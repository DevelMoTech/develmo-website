import type { Metadata } from "next";
import { Raleway, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { MegaNav } from "@/components/MegaNav";
import { SiteFooter } from "@/components/SiteFooter";
import { StickyCta } from "@/components/StickyCta";
import { site } from "@/lib/site";
import { OG_IMAGE } from "@/lib/meta";
import { getLocale } from "@/lib/i18n-server";
import { isRtl } from "@/lib/i18n";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-raleway",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "DevelMo: AI That Fits Your Business",
    template: "%s | DevelMo",
  },
  description: site.description,
  applicationName: "DevelMo",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "DevelMo",
    url: "/",
    title: "DevelMo: AI That Fits Your Business",
    description: site.description,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "DevelMo: AI That Fits Your Business",
    description: site.description,
    images: [OG_IMAGE.url],
  },
  robots: { index: true, follow: true },
};

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  // suppressHydrationWarning on <html>: the inline theme script below sets
  // data-theme before hydration, which React would otherwise flag as a mismatch.
  // data-scroll-behavior="smooth" declares the html{scroll-behavior:smooth} in
  // globals.css so Next disables it during route transitions (jump to top, not glide).
  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      className={`${raleway.variable} ${hanken.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        <a href="#main" className="skip-link">Skip to content</a>
        <MegaNav locale={locale} />
        <main id="main" tabIndex={-1}>{children}</main>
        <SiteFooter locale={locale} />
        <StickyCta locale={locale} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
        />
      </body>
    </html>
  );
}
