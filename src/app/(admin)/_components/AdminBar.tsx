import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { can, type Role } from "@/lib/auth/rbac";

// Minimal top strip for authenticated pages until the full shell (sidebar,
// breadcrumbs, search, theme switcher) lands in Phase 3.
export function AdminBar({ csrf, role, current }: { csrf: string; role: Role; current: string }) {
  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/admin", label: "Home", show: true },
    { href: "/admin/users", label: "Users", show: can(role, "users:read") },
    { href: "/admin/account", label: "Account", show: true },
  ];
  return (
    <header className="adm-bar">
      <Link href="/admin" className="adm-bar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/develmo-logo.png" alt="" />
        <span>Admin</span>
      </Link>
      <nav className="adm-bar-nav" aria-label="Admin">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        <LogoutButton csrf={csrf} className="adm-bar-signout" />
      </nav>
    </header>
  );
}
