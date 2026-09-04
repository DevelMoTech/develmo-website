"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub navigation across the site content editors (brief §3.9).
const TABS = [
  { href: "/admin/content", label: "Overview" },
  { href: "/admin/content/services", label: "Services" },
  { href: "/admin/content/industries", label: "Industries" },
  { href: "/admin/content/products", label: "Products" },
  { href: "/admin/content/about", label: "About" },
  { href: "/admin/content/site", label: "Company facts" },
  { href: "/admin/content/navigation", label: "Navigation" },
];

export function ContentNav() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/admin/content" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="adm-tabs" aria-label="Content sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="adm-tab" aria-current={current(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
