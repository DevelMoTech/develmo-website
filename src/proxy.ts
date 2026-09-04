import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { matchRedirect, REDIRECT_TTL_MS, redirectTarget, type RedirectMap } from "@/lib/seo/redirect-map";
import { ACCESS_TTL_MS, BLOCKED_BODY, evaluateAccess, type AccessRuleSet } from "@/lib/security/access";
import { proxyClientIp } from "@/lib/security/client-ip";

const SESSION_COOKIE = "__Host-dm_session";
const CSRF_COOKIE = "__Host-dm_csrf";

// Admin pages reachable without a session (the auth flows themselves).
const PUBLIC_ADMIN_PAGES = new Set([
  "/admin/login",
  "/admin/signup",
  "/admin/forgot-password",
  "/admin/reset-password",
]);

const PREVIEW_PATH = /^\/admin\/posts\/[^/]+\/preview\/?$/;

// Database redirects (brief §3.6). The map lives in this instance's memory
// and is refreshed from /api/seo/redirects at most once per TTL, in the
// background after the response, so a public request never waits on a
// lookup and never touches the database. The only blocking fetch is the
// very first request an instance serves. Hits are counted here and flushed
// in the same refresh call. A new or changed rule is live everywhere within
// one TTL of being saved.

const REDIRECT_FETCH_TIMEOUT_MS = 3_000;

type RedirectCache = { map: RedirectMap | null; fetchedAt: number; inflight: Promise<void> | null };
const redirectCache: RedirectCache = { map: null, fetchedAt: 0, inflight: null };
const pendingHits = new Map<string, number>();

// IP access control (brief §3.7). Same shape as the redirect map: the rule
// set lives in this instance's memory and is refreshed from
// /api/security/access-rules at most once per ACCESS_TTL_MS, in the
// background after the response, so no public request pays a database
// lookup. The endpoint needs the cron secret, which the proxy sends; without
// it, or with the database unreachable, the proxy holds the last rule set it
// had and enforces nothing new. An unreadable blocklist fails open on
// purpose: a marketing site must keep serving visitors.
type AccessCache = { set: AccessRuleSet | null; fetchedAt: number; inflight: Promise<void> | null };
const accessCache: AccessCache = { set: null, fetchedAt: 0, inflight: null };

async function refreshAccessRules(origin: string): Promise<void> {
  if (accessCache.inflight) return accessCache.inflight;
  const run = (async () => {
    const secret = process.env.CRON_SECRET;
    try {
      if (!secret || secret.length < 16) throw new Error("CRON_SECRET is not set; IP access rules cannot be read");
      const res = await fetch(`${origin}/api/security/access-rules`, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REDIRECT_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`access rules ${res.status}`);
      const set = (await res.json()) as AccessRuleSet;
      if (set && typeof set === "object" && Array.isArray(set.rules)) accessCache.set = set;
      accessCache.fetchedAt = Date.now();
    } catch (err) {
      console.error("[proxy] access rule refresh failed:", err instanceof Error ? err.message : err);
      // Keep the last good set; a cold instance enforces nothing and retries
      // in two seconds rather than waiting a whole TTL.
      accessCache.fetchedAt = Date.now() - ACCESS_TTL_MS + 2_000;
    }
  })();
  accessCache.inflight = run;
  try {
    await run;
  } finally {
    accessCache.inflight = null;
  }
}

async function refreshRedirects(origin: string): Promise<void> {
  if (redirectCache.inflight) return redirectCache.inflight;
  const run = (async () => {
    const secret = process.env.CRON_SECRET;
    const hits = Object.fromEntries(pendingHits);
    const flush = secret && secret.length >= 16 && pendingHits.size > 0;
    if (flush) pendingHits.clear();
    try {
      const res = await fetch(`${origin}/api/seo/redirects`, {
        method: flush ? "POST" : "GET",
        headers: flush ? { authorization: `Bearer ${secret}`, "content-type": "application/json" } : undefined,
        body: flush ? JSON.stringify({ hits }) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REDIRECT_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`redirect map ${res.status}`);
      const map = (await res.json()) as RedirectMap;
      if (map && typeof map === "object" && map.rules && typeof map.rules === "object") {
        redirectCache.map = map;
      }
      redirectCache.fetchedAt = Date.now();
    } catch (err) {
      // Keep serving the last good map (a 503 means the database could not
      // be read; an empty map must not replace real rules). A cold instance
      // with no map yet serves none and retries within two seconds instead
      // of waiting a whole TTL.
      if (flush) for (const [k, v] of Object.entries(hits)) pendingHits.set(k, (pendingHits.get(k) ?? 0) + v);
      console.error("[proxy] redirect map refresh failed:", err instanceof Error ? err.message : err);
      if (!redirectCache.map) redirectCache.map = { rules: {}, generatedAt: new Date(0).toISOString() };
      redirectCache.fetchedAt = Date.now() - REDIRECT_TTL_MS + 2_000;
    }
  })();
  redirectCache.inflight = run;
  try {
    await run;
  } finally {
    redirectCache.inflight = null;
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = req.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");
  const isApi = pathname.startsWith("/api/");

  // Keep non-production hosts (Vercel preview + the *.vercel.app production URL)
  // out of search indexes so they don't compete with develmo.com as duplicates.
  // Once the custom domain is live, requests to develmo.com are indexed normally.
  const host = (req.headers.get("host") || "").toLowerCase();
  const isLiveDomain = host === "develmo.com" || host.endsWith(".develmo.com");

  // IP access control, before anything else: a blocked address gets 403 on
  // the whole site, pages and API alike, and never reaches a route. The
  // rule set that decides this is already in memory.
  //
  // The two endpoints the proxy feeds itself from are exempt. They are
  // reached only by this function, over the loopback, with the cron secret;
  // running the check on them would have the refresh wait on itself.
  const origin = req.nextUrl.origin;
  const isProxyFeed = pathname === "/api/security/access-rules" || pathname === "/api/seo/redirects";
  if (!isProxyFeed) {
    if (!accessCache.set) {
      await refreshAccessRules(origin);
    } else if (Date.now() - accessCache.fetchedAt > ACCESS_TTL_MS && !accessCache.inflight) {
      event.waitUntil(refreshAccessRules(origin));
    }
  }
  if (!isProxyFeed && accessCache.set && accessCache.set.rules.length > 0) {
    const decision = evaluateAccess(accessCache.set, proxyClientIp(req.headers));
    if (!decision.allowed) {
      return new NextResponse(BLOCKED_BODY, {
        status: 403,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }
  }

  // Public pages only: the console and the API are never redirected.
  if (!isAdminPage && !isApi && (req.method === "GET" || req.method === "HEAD")) {
    if (!redirectCache.map) {
      await refreshRedirects(origin);
    } else if (Date.now() - redirectCache.fetchedAt > REDIRECT_TTL_MS && !redirectCache.inflight) {
      event.waitUntil(refreshRedirects(origin));
    }
    const rule = matchRedirect(redirectCache.map, pathname);
    if (rule) {
      pendingHits.set(rule.source, (pendingHits.get(rule.source) ?? 0) + 1);
      const out = NextResponse.redirect(redirectTarget(rule, origin, search), rule.code);
      if (!isLiveDomain) out.headers.set("X-Robots-Tag", "noindex, nofollow");
      return out;
    }
  }

  // Draft previews must not reveal a post exists: no session cookie means a
  // plain 404, never a login redirect. The page itself repeats the check.
  if (PREVIEW_PATH.test(pathname) && !req.cookies.has(SESSION_COOKIE)) {
    const missing = req.nextUrl.clone();
    missing.pathname = "/admin/__preview-not-found";
    missing.search = "";
    const res = NextResponse.rewrite(missing);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  // Optimistic session gate for the console: cookie presence only. The real
  // session, MFA and role checks run in the pages and route handlers.
  if (isAdminPage && !PUBLIC_ADMIN_PAGES.has(pathname) && !req.cookies.has(SESSION_COOKIE)) {
    const login = req.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    login.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(login);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  // Double-submit CSRF token for the console: issued here so the very first
  // render of a form already has it. The value is mirrored into a request
  // header for the page; any client-supplied copy of that header is dropped.
  let res: NextResponse;
  let csrfToSet: string | null = null;
  if (isAdminPage || isAdminApi) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.delete("x-dm-csrf");
    let csrf = req.cookies.get(CSRF_COOKIE)?.value ?? "";
    if (!/^[a-f0-9]{64}$/.test(csrf)) {
      csrf = randomToken();
      csrfToSet = csrf;
    }
    requestHeaders.set("x-dm-csrf", csrf);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    res = NextResponse.next();
  }
  if (csrfToSet) {
    res.cookies.set(CSRF_COOKIE, csrfToSet, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // The console is never indexed, on any host.
  if (isAdminPage || isAdminApi) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (!isLiveDomain) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  // Skip static assets + the sitemap/robots so only real pages are evaluated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og.jpg).*)"],
};
