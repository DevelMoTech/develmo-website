import { can, type Permission, type Role } from "@/lib/auth/rbac";
import type { IconName } from "../_components/ui/Icon";

// Single source of truth for the console's navigation, breadcrumbs, global
// search "pages" and keyboard shortcuts. Only routes that exist are listed.

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  permission?: Permission;
  // Second key of the "g" chord, e.g. "p" for "g then p".
  chord?: string;
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: "home", chord: "h", description: "At a glance" }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/posts", label: "Posts", icon: "posts", permission: "content:read", chord: "p", description: "Blog and knowledge base" },
      { href: "/admin/jobs", label: "Jobs", icon: "jobs", permission: "content:read", chord: "j", description: "Open roles" },
      { href: "/admin/applications", label: "Applications", icon: "applications", permission: "submissions:read", description: "Applicant pipeline" },
      { href: "/admin/media", label: "Media", icon: "media", permission: "media:read", chord: "m", description: "Images and files" },
      { href: "/admin/content", label: "Site content", icon: "content", permission: "content:read", description: "Services, industries, products, about" },
      { href: "/admin/translations", label: "Translations", icon: "translate", permission: "content:read", description: "Locale dictionary" },
    ],
  },
  {
    label: "Inbox",
    items: [{ href: "/admin/submissions", label: "Submissions", icon: "inbox", permission: "submissions:read", chord: "i", description: "Enquiries and signups" }],
  },
  {
    label: "Site",
    items: [
      { href: "/admin/seo", label: "SEO", icon: "seo", permission: "seo:read", description: "Metadata, redirects, sitemap" },
      { href: "/admin/performance", label: "Performance", icon: "gauge", permission: "performance:read", description: "Vitals, assets, cache" },
      { href: "/admin/security", label: "Security", icon: "shield", permission: "security:read", description: "Events, access, headers" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: "users", permission: "users:read", chord: "u", description: "Staff and invitations" },
      { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings:read", description: "Site facts and toggles" },
      { href: "/admin/audit", label: "Audit log", icon: "audit", permission: "audit:read", chord: "a", description: "Every change, who and when" },
      { href: "/admin/account", label: "Account", icon: "user", description: "Profile, password, sessions" },
    ],
  },
];

export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || can(role, i.permission)),
  })).filter((g) => g.items.length > 0);
}

export function findNavItem(href: string): NavItem | undefined {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.href === href) return i;
  return undefined;
}

// Labels for path segments that are not nav items themselves.
const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  edit: "Edit",
  invite: "Invite",
  preview: "Preview",
  revisions: "Revisions",
  templates: "Email templates",
  spam: "Spam",
  pages: "Pages",
  redirects: "Redirects",
  schema: "Structured data",
  sitemap: "Sitemap",
  robots: "robots.txt",
  limits: "Rate limits",
  sessions: "Sessions",
  audit: "Audit",
  events: "Events",
  access: "Access control",
  headers: "Headers",
  dependencies: "Dependencies",
  assets: "Assets",
  cache: "Cache",
  services: "Services",
  industries: "Industries",
  products: "Products",
  about: "About",
  site: "Site",
  navigation: "Navigation",
  mfa: "Two-factor",
  enrol: "Set up",
  verify: "Verify",
};

export type Crumb = { href: string; label: string };

export function breadcrumbsFor(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ href: "/admin", label: "Dashboard" }];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    if (href === "/admin") continue;
    const item = findNavItem(href);
    const label = item?.label ?? SEGMENT_LABELS[part] ?? (part.length > 12 ? "Detail" : part.charAt(0).toUpperCase() + part.slice(1));
    crumbs.push({ href, label });
  }
  return crumbs;
}
