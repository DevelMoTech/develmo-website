import type { MetadataRoute } from "next";
import type { Changefreq } from "@/lib/schemas/seo";
import { site } from "@/lib/site";
import { listPublicRoutes, NEVER_INDEXED, type PublicRoute } from "./routes";
import { getSeoOverrides, getSeoOverridesOrNull, type SeoOverride } from "./overrides";

// Sitemap entries (brief §3.6): the route registry with the per-route
// include, changefreq and priority overrides applied. /admin and /api never
// appear, whatever the overrides table says.

export const SITEMAP_TAG = "sitemap";

export type SitemapRow = {
  path: string;
  kind: PublicRoute["kind"];
  label: string;
  included: boolean;
  // Why an excluded route is out: the editor's own noindex flag, an SEO
  // override, or the default.
  reason: "override" | "noindex" | "content" | "default";
  changefreq: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  defaults: PublicRoute["sitemapDefault"];
  // The override's own values, null where the default applies, so the
  // console can tell an explicit value from a coincidental default.
  explicit: { include: boolean | null; changefreq: Changefreq | null; priority: number | null };
};

export function resolveSitemapRow(route: PublicRoute, o: SeoOverride | undefined): SitemapRow {
  let included = route.sitemapDefault.include;
  let reason: SitemapRow["reason"] = "default";
  if (o?.sitemapInclude !== null && o?.sitemapInclude !== undefined) {
    included = o.sitemapInclude;
    reason = "override";
  }
  if (route.contentNoindex) {
    included = false;
    reason = "content";
  }
  if (o?.noindex) {
    included = false;
    reason = "noindex";
  }
  if (NEVER_INDEXED.test(route.path)) included = false;
  return {
    path: route.path,
    kind: route.kind,
    label: route.label,
    included,
    reason,
    changefreq: o?.sitemapChangefreq ?? route.sitemapDefault.changefreq,
    priority: o?.sitemapPriority ?? route.sitemapDefault.priority,
    defaults: route.sitemapDefault,
    explicit: { include: o?.sitemapInclude ?? null, changefreq: o?.sitemapChangefreq ?? null, priority: o?.sitemapPriority ?? null },
  };
}

export function composeRows(routes: PublicRoute[], overrides: SeoOverride[]): SitemapRow[] {
  const byPath = new Map(overrides.map((o) => [o.path, o]));
  return routes.map((r) => resolveSitemapRow(r, byPath.get(r.path)));
}

// For the console.
export async function sitemapRows(): Promise<SitemapRow[]> {
  const [routes, overrides] = await Promise.all([listPublicRoutes(), getSeoOverrides()]);
  return composeRows(routes, overrides);
}

export type SitemapEntry = { url: string; lastModified: Date; changeFrequency: SitemapRow["changefreq"]; priority: number };

// For the served file. `fallback` is true when the overrides could not be
// read, so the caller knows the result must not be cached anywhere.
export async function buildSitemapEntries(now = new Date()): Promise<{ entries: SitemapEntry[]; fallback: boolean }> {
  const [routes, overrides] = await Promise.all([listPublicRoutes(), getSeoOverridesOrNull()]);
  const rows = composeRows(routes, overrides ?? []);
  const entries = rows
    .filter((r) => r.included && !NEVER_INDEXED.test(r.path))
    .map((r) => ({
      url: `${site.url}${r.path === "/" ? "" : r.path}`,
      lastModified: now,
      changeFrequency: r.changefreq,
      priority: r.priority,
    }));
  return { entries, fallback: overrides === null };
}

// Byte for byte the XML Next's sitemap.ts convention produced for the same
// entries (no images, videos or alternates).
export function renderSitemapXml(entries: SitemapEntry[]): string {
  let content = "";
  content += '<?xml version="1.0" encoding="UTF-8"?>\n';
  content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const item of entries) {
    content += "<url>\n";
    content += `<loc>${item.url}</loc>\n`;
    content += `<lastmod>${item.lastModified.toISOString()}</lastmod>\n`;
    if (item.changeFrequency) content += `<changefreq>${item.changeFrequency}</changefreq>\n`;
    if (typeof item.priority === "number") content += `<priority>${item.priority}</priority>\n`;
    content += "</url>\n";
  }
  content += "</urlset>\n";
  return content;
}
