"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub navigation across the SEO manager's pages (brief §3.6).
const TABS = [
  { href: "/admin/seo", label: "Overview" },
  { href: "/admin/seo/pages", label: "Pages" },
  { href: "/admin/seo/redirects", label: "Redirects" },
  { href: "/admin/seo/sitemap", label: "Sitemap" },
  { href: "/admin/seo/robots", label: "robots.txt" },
  { href: "/admin/seo/schema", label: "Structured data" },
  { href: "/admin/seo/audit", label: "Audit" },
];

export function SeoNav() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/admin/seo" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="adm-tabs" aria-label="SEO sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="adm-tab" aria-current={current(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// The read-only note the brief asks for on every SEO page.
export function LocaleNote() {
  return (
    <p className="adm-note" role="note">
      Cookie based locale means only English is indexed today: every language shares one URL, and crawlers see the English version. Metadata and overrides here are English only by design.
    </p>
  );
}
