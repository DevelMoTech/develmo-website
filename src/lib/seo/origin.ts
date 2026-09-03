import { site } from "@/lib/site";

// The origin the console is allowed to fetch on the site's behalf (current
// metadata, sitemap regeneration, the audit crawl). The request's base URL
// comes from forwarded headers, so it is only trusted when it names this
// site, this deployment's own Vercel URL, or a local development server;
// anything else falls back to the canonical origin, which keeps these
// fetches from reaching third parties.
export function trustedOrigin(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    const deployment = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .filter((v): v is string => !!v)
      .map((v) => v.toLowerCase().replace(/^https?:\/\//, ""));
    const own = host === "develmo.com" || host.endsWith(".develmo.com") || deployment.includes(host);
    if ((local && u.protocol === "http:") || (own && u.protocol === "https:")) return u.origin;
  } catch {
    // fall through
  }
  return site.url;
}
