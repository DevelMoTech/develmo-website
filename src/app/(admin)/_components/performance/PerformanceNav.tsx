"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub navigation across the performance manager's pages (brief §3.8).
const TABS = [
  { href: "/admin/performance", label: "Web Vitals" },
  { href: "/admin/performance/psi", label: "PageSpeed" },
  { href: "/admin/performance/assets", label: "Assets" },
  { href: "/admin/performance/build", label: "Build" },
  { href: "/admin/performance/cache", label: "Cache" },
  { href: "/admin/performance/media", label: "Media" },
];

export function PerformanceNav() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/admin/performance" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="adm-tabs" aria-label="Performance sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="adm-tab" aria-current={current(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
