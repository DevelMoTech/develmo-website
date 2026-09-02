import { safeEqual } from "./tokens";

// CSRF defence for route handlers (brief §7.3). Server Actions get Next's own
// Origin/Host check; every /api/admin handler gets the same explicit origin
// check here plus a double-submit token: the proxy issues an httpOnly
// __Host-dm_csrf cookie, pages embed its value, and mutating requests must echo
// it back in the x-csrf-token header (or a `csrf` form field).

export const CSRF_HEADER = "x-csrf-token";

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

// Origin must match the request host. Falls back to Referer when a client omits
// Origin; a request with neither is rejected, browsers always send one on POST.
export function originMatches(headers: Headers): boolean {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.toLowerCase().split(",")[0]?.trim();
  if (!host) return false;
  const origin = hostOf(headers.get("origin")) ?? hostOf(headers.get("referer"));
  return origin !== null && origin === host;
}

export function csrfTokenMatches(cookieToken: string | undefined, submitted: string | undefined | null): boolean {
  if (!cookieToken || !submitted) return false;
  if (cookieToken.length < 20 || submitted.length < 20) return false;
  return safeEqual(cookieToken, submitted);
}
