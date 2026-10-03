import { getServices } from "@/lib/repo/services";
import { getIndustries } from "@/lib/repo/industries";
import { getProducts } from "@/lib/repo/products";
import { getPosts } from "@/lib/repo/posts";
import { getOpenJobs } from "@/lib/repo/jobs";
import type { Changefreq } from "@/lib/schemas/seo";

// The registry of public routes (brief §3.6): every static page plus the
// dynamic ones from the repo layer. Feeds the overrides table, the sitemap
// and the audit's orphan check. /admin and /api are never part of it.

export type RouteKind = "static" | "service" | "industry" | "product" | "blog" | "kb" | "job";

export type PublicRoute = {
  path: string;
  kind: RouteKind;
  label: string;
  // Sitemap defaults, exactly what src/app/sitemap.ts emitted before the
  // manager existed.
  sitemapDefault: { include: boolean; changefreq: Changefreq; priority: number };
  // Posts and jobs can be flagged noindex in their own editors; they stay
  // out of the sitemap regardless of the SEO override.
  contentNoindex: boolean;
  // Detail pages with FAQs emit FAQPage JSON-LD unless switched off.
  hasFaq: boolean;
};

export const STATIC_ROUTES: { path: string; label: string; inSitemap: boolean }[] = [
  { path: "/", label: "Home", inSitemap: true },
  { path: "/what-we-do", label: "What We Do", inSitemap: true },
  { path: "/who-we-help", label: "Who We Help", inSitemap: true },
  { path: "/our-products", label: "Our Products", inSitemap: true },
  { path: "/our-products/crowdiq", label: "CrowdIQ", inSitemap: true },
  { path: "/who-we-are", label: "Who We Are", inSitemap: true },
  { path: "/who-we-are/about-develmo", label: "About DevelMo", inSitemap: true },
  { path: "/who-we-are/advisory-board", label: "Company Advisory Board", inSitemap: true },
  { path: "/our-knowledge-base", label: "Knowledge Base", inSitemap: true },
  { path: "/our-blogs", label: "Our Blogs", inSitemap: true },
  { path: "/jobs", label: "Careers", inSitemap: true },
  { path: "/contact-develmo", label: "Contact", inSitemap: true },
  { path: "/privacy", label: "Privacy Policy", inSitemap: true },
  { path: "/terms", label: "Terms of Service", inSitemap: true },
  { path: "/cookies", label: "Cookie Policy", inSitemap: true },
  // Not in the sitemap before the manager existed; stays out by default.
  { path: "/case-studies", label: "Case Studies", inSitemap: false },
];

export const NEVER_INDEXED = /^\/(admin|api)(\/|$)/;

const priorityFor = (path: string): number => (path === "" || path === "/" ? 1 : path.startsWith("/our-blogs/") || path.startsWith("/our-knowledge-base/") ? 0.6 : 0.7);

function route(path: string, kind: RouteKind, label: string, opts: { include?: boolean; contentNoindex?: boolean; hasFaq?: boolean } = {}): PublicRoute {
  return {
    path,
    kind,
    label,
    sitemapDefault: { include: opts.include ?? true, changefreq: "monthly", priority: priorityFor(path) },
    contentNoindex: opts.contentNoindex ?? false,
    hasFaq: opts.hasFaq ?? false,
  };
}

export async function listPublicRoutes(): Promise<PublicRoute[]> {
  const [services, industries, products, blog, kb, jobs] = await Promise.all([
    getServices(),
    getIndustries(),
    getProducts(),
    getPosts("blog"),
    getPosts("kb"),
    getOpenJobs(),
  ]);
  const out: PublicRoute[] = STATIC_ROUTES.map((s) => route(s.path, "static", s.label, { include: s.inSitemap }));
  for (const s of services) out.push(route(`/what-we-do/${s.slug}`, "service", s.title, { hasFaq: (s.faqs?.length ?? 0) > 0 }));
  for (const i of industries) out.push(route(`/who-we-help/${i.slug}`, "industry", i.name, { hasFaq: (i.faqs?.length ?? 0) > 0 }));
  for (const p of products) if (p.slug !== "crowdiq") out.push(route(`/our-products/${p.slug}`, "product", p.title, { hasFaq: (p.faqs?.length ?? 0) > 0 }));
  for (const p of blog) out.push(route(`/our-blogs/${p.slug}`, "blog", p.title, { contentNoindex: p.seo.noindex }));
  for (const p of kb) out.push(route(`/our-knowledge-base/${p.slug}`, "kb", p.title, { contentNoindex: p.seo.noindex }));
  for (const j of jobs) out.push(route(`/jobs/${j.slug}`, "job", j.title, { contentNoindex: j.seo.noindex }));
  return out.filter((r) => !NEVER_INDEXED.test(r.path));
}
