import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "__Host-dm_session";
const CSRF_COOKIE = "__Host-dm_csrf";

// Admin pages reachable without a session (the auth flows themselves).
const PUBLIC_ADMIN_PAGES = new Set([
  "/admin/login",
  "/admin/signup",
  "/admin/forgot-password",
  "/admin/reset-password",
]);

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

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

  // Keep non-production hosts (Vercel preview + the *.vercel.app production URL)
  // out of search indexes so they don't compete with develmo.com as duplicates.
  // Once the custom domain is live, requests to develmo.com are indexed normally.
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
