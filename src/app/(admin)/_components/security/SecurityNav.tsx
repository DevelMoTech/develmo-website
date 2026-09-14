"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub navigation across the security manager's pages (brief §3.7).
const TABS = [
  { href: "/admin/security", label: "Overview" },
  { href: "/admin/security/authentication", label: "Authentication" },
  { href: "/admin/security/events", label: "Events" },
  { href: "/admin/security/access", label: "Access control" },
  { href: "/admin/security/limits", label: "Rate limits" },
  { href: "/admin/security/sessions", label: "Sessions" },
  { href: "/admin/security/headers", label: "Headers" },
  { href: "/admin/security/dependencies", label: "Dependencies" },
];

export function SecurityNav() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/admin/security" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="adm-tabs" aria-label="Security sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="adm-tab" aria-current={current(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
