import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep non-production hosts (Vercel preview + the *.vercel.app production URL)
// out of search indexes so they don't compete with develmo.com as duplicates.
// Once the custom domain is live, requests to develmo.com are indexed normally.
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const host = (req.headers.get("host") || "").toLowerCase();
  const isLiveDomain = host === "develmo.com" || host.endsWith(".develmo.com");
  if (!isLiveDomain) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  // Skip static assets + the sitemap/robots so only real pages are evaluated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og.jpg).*)"],
};
