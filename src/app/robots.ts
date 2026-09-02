import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin and /api/admin stay disallowed regardless of any later edits
      // to this file from the SEO manager (brief §3.6).
      disallow: ["/api/", "/studio", "/admin", "/api/admin"],
    },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
