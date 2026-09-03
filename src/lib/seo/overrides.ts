import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media, seoOverrides } from "@/db/schema";
import { repoQuery } from "@/lib/repo/util";
import type { Changefreq } from "@/lib/schemas/seo";

// Read side of the per-route overrides, through the repo layer: cached with
// tags, timed out and circuit-broken like every other public read, so a page
// render never pays a database round trip for its metadata and the site
// keeps serving the hardcoded values with the database down.

export type SeoOverride = {
  path: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  ogImage: { id: string; url: string; width: number | null; height: number | null; alt: string } | null;
  noindex: boolean | null;
  nofollow: boolean | null;
  sitemapInclude: boolean | null;
  sitemapChangefreq: Changefreq | null;
  sitemapPriority: number | null;
  faqEnabled: boolean | null;
  updatedAt: string;
};

type Row = {
  path: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  noindex: boolean | null;
  nofollow: boolean | null;
  sitemapInclude: boolean | null;
  sitemapChangefreq: string | null;
  sitemapPriority: number | null;
  faqEnabled: boolean | null;
  updatedAt: Date;
  ogId: string | null;
  ogUrl: string | null;
  ogWidth: number | null;
  ogHeight: number | null;
  ogAlt: string | null;
};

function toOverride(r: Row): SeoOverride {
  return {
    path: r.path,
    metaTitle: r.metaTitle,
    metaDescription: r.metaDescription,
    canonical: r.canonical,
    ogImage: r.ogId && r.ogUrl ? { id: r.ogId, url: r.ogUrl, width: r.ogWidth, height: r.ogHeight, alt: r.ogAlt ?? "" } : null,
    noindex: r.noindex,
    nofollow: r.nofollow,
    sitemapInclude: r.sitemapInclude,
    sitemapChangefreq: (r.sitemapChangefreq as Changefreq | null) ?? null,
    sitemapPriority: r.sitemapPriority,
    faqEnabled: r.faqEnabled,
    updatedAt: r.updatedAt.toISOString(),
  };
}

const selection = {
  path: seoOverrides.path,
  metaTitle: seoOverrides.metaTitle,
  metaDescription: seoOverrides.metaDescription,
  canonical: seoOverrides.canonical,
  noindex: seoOverrides.noindex,
  nofollow: seoOverrides.nofollow,
  sitemapInclude: seoOverrides.sitemapInclude,
  sitemapChangefreq: seoOverrides.sitemapChangefreq,
  sitemapPriority: seoOverrides.sitemapPriority,
  faqEnabled: seoOverrides.faqEnabled,
  updatedAt: seoOverrides.updatedAt,
  ogId: media.id,
  ogUrl: media.url,
  ogWidth: media.width,
  ogHeight: media.height,
  ogAlt: media.altText,
};

export const SEO_TAG = "seo";
export const seoPathTag = (path: string) => `seo:${path}`;

export async function getSeoOverride(path: string): Promise<SeoOverride | null> {
  return repoQuery<SeoOverride | null>({
    keys: ["repo", "seo", "override", path],
    tags: [seoPathTag(path)],
    // Tag-only: a save busts the route, nothing expires on a timer, so the
    // lookup is a cache hit on every request after the first.
    revalidate: false,
    query: async () => {
      const rows = await getDb().select(selection).from(seoOverrides).leftJoin(media, eq(media.id, seoOverrides.ogImageId)).where(eq(seoOverrides.path, path)).limit(1);
      return rows[0] ? toOverride(rows[0]) : null;
    },
    fallback: () => null,
  });
}

export async function getSeoOverrides(): Promise<SeoOverride[]> {
  return repoQuery<SeoOverride[]>({
    keys: ["repo", "seo", "override", "list"],
    tags: [SEO_TAG],
    revalidate: false,
    query: async () => {
      const rows = await getDb().select(selection).from(seoOverrides).leftJoin(media, eq(media.id, seoOverrides.ogImageId)).orderBy(asc(seoOverrides.path));
      return rows.map(toOverride);
    },
    fallback: () => [],
  });
}

// Like getSeoOverrides, but null instead of an empty list when the table
// could not be read, for callers that must not cache a composed fallback.
export async function getSeoOverridesOrNull(): Promise<SeoOverride[] | null> {
  return repoQuery<SeoOverride[] | null>({
    keys: ["repo", "seo", "override", "list-or-null"],
    tags: [SEO_TAG],
    revalidate: false,
    query: async () => {
      const rows = await getDb().select(selection).from(seoOverrides).leftJoin(media, eq(media.id, seoOverrides.ogImageId)).orderBy(asc(seoOverrides.path));
      return rows.map(toOverride);
    },
    fallback: () => null,
  });
}

// The detail pages ask this before emitting FAQPage JSON-LD.
export async function faqSchemaEnabled(path: string): Promise<boolean> {
  const o = await getSeoOverride(path);
  return o?.faqEnabled !== false;
}
