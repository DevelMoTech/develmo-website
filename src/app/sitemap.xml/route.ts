import { setSetting } from "@/lib/admin/settings";
import { buildSitemapEntries, renderSitemapXml } from "@/lib/seo/sitemap";

// The sitemap (brief §3.6): the public route registry with the per-route
// include, changefreq and priority from /admin/seo/sitemap applied. Served
// by a dynamic route (replacing the sitemap.ts convention) so that a file
// composed while the overrides could not be read is never cached anywhere:
// it goes out with no-store and the next request tries again. Every input
// is a data-cache hit on a normal request, so this costs no query.
//
// "Last generated" is recorded at most once a minute per instance, and
// always when the console's Regenerate now warms the file.

export const dynamic = "force-dynamic";

const RECORD_EVERY_MS = 60_000;
let lastRecordedAt = 0;
let lastRecordedCount = -1;

export async function GET(req: Request) {
  const now = new Date();
  const { entries, fallback } = await buildSitemapEntries(now);
  const forced = req.headers.get("x-seo-regenerate") === "1";
  if (!fallback && (forced || Date.now() - lastRecordedAt > RECORD_EVERY_MS || entries.length !== lastRecordedCount)) {
    lastRecordedAt = Date.now();
    lastRecordedCount = entries.length;
    try {
      await setSetting("sitemap_state", { generatedAt: now.toISOString(), urls: entries.length }, null);
    } catch (err) {
      console.error("[sitemap] could not record the generation time:", err instanceof Error ? err.message : err);
    }
  }
  return new Response(renderSitemapXml(entries), {
    headers: {
      "content-type": "application/xml",
      "cache-control": fallback ? "no-store" : "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
