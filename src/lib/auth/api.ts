import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { describeDbError, isDatabaseUnavailable } from "@/db/errors";
import { CSRF_HEADER, csrfTokenMatches, originMatches } from "./csrf";
import { getClientIp, hashIp } from "./ip";
import { securityEvent } from "./log";
import { getMfaPolicy, stillPending } from "./policy";
import type { Permission } from "./rbac";
import { allows as roleAllows } from "./role-access";
import { CSRF_COOKIE, SESSION_COOKIE, loadSession, type SessionWithUser } from "./session";

// Shared wrapper for every /api/admin route handler. Order of checks:
//   1. same-origin (Origin/Referer vs Host)         -> 403 csrf
//   2. double-submit CSRF token                     -> 403 csrf
//   3. session cookie valid and not MFA-pending     -> 401
//   4. role permission                              -> 403 forbidden
//   5. zod-validated body (JSON or form encoded)    -> 400 invalid
// Only then does the handler run. Every response is JSON.

export type ApiContext<T> = {
  req: Request;
  body: T;
  auth: SessionWithUser | null;
  ip: string;
  ipHash: string;
  userAgent: string | null;
  sessionToken: string | null;
  baseUrl: string;
};

type AuthMode = "required" | "none" | "mfa-pending";

export function apiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export function apiOk(data: Record<string, unknown> = {}, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function rateLimited(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: "rate_limited", retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function requestBaseUrl(headers: Headers): string {
  const override = process.env.ADMIN_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "develmo.com";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host.split(",")[0].trim()}`;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = await req.json().catch(() => null);
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  }
  if (type.includes("form")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const out: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      out[k] = typeof v === "string" ? v : v.name;
    });
    return out;
  }
  return {};
}

export function adminRoute<T>(
  // rawBody: leave the request body untouched (multipart uploads read it
  // themselves); the CSRF token must then travel in the header.
  opts: { auth: AuthMode; permission?: Permission; schema?: ZodType<T>; rawBody?: boolean },
  handler: (ctx: ApiContext<T>) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const ip = getClientIp(req.headers);
    const ipHash = hashIp(ip);
    const userAgent = req.headers.get("user-agent");
    const cookies = parseCookies(req.headers.get("cookie"));
    const path = new URL(req.url).pathname;

    const mutating = req.method !== "GET" && req.method !== "HEAD";
    let bodyRaw: Record<string, unknown> = {};
    if (mutating) {
      if (!originMatches(req.headers)) {
        await securityEvent({ type: "csrf_rejected", ipHash, path, userAgent, meta: { reason: "origin" } });
        return apiError(403, "csrf");
      }
      if (!opts.rawBody) bodyRaw = await readBody(req);
      const submitted = req.headers.get(CSRF_HEADER) ?? (typeof bodyRaw.csrf === "string" ? bodyRaw.csrf : null);
      if (!csrfTokenMatches(cookies[CSRF_COOKIE], submitted)) {
        await securityEvent({ type: "csrf_rejected", ipHash, path, userAgent, meta: { reason: "token" } });
        return apiError(403, "csrf");
      }
    }

    const sessionToken = cookies[SESSION_COOKIE] ?? null;
    try {
      let auth: SessionWithUser | null = null;
      if (opts.auth !== "none") {
        auth = await loadSession(sessionToken);
        if (!auth) return apiError(401, "unauthenticated");
        if (opts.auth !== "mfa-pending" && stillPending(await getMfaPolicy(), auth.session.mfaPending)) return apiError(401, "mfa_required");
        if (opts.permission && !(await roleAllows(auth.user.role, opts.permission))) {
          await securityEvent({
            type: "permission_denied",
            userId: auth.user.id,
            email: auth.user.email,
            ipHash,
            path,
            userAgent,
            meta: { permission: opts.permission },
          });
          return apiError(403, "forbidden");
        }
      }

      let body = bodyRaw as T;
      if (opts.schema) {
        const parsed = opts.schema.safeParse(bodyRaw);
        if (!parsed.success) {
          return apiError(400, "invalid", {
            issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          });
        }
        body = parsed.data;
      }

      return await handler({
        req,
        body,
        auth,
        ip,
        ipHash,
        userAgent,
        sessionToken,
        baseUrl: requestBaseUrl(req.headers),
      });
    } catch (err) {
      // An unreachable database is an outage, not a bug: say so with a
      // status the client can act on, and keep the answer JSON like every
      // other one from this wrapper. Without this the sign-in form got a
      // bare 500 with no body and showed "Something went wrong".
      if (isDatabaseUnavailable(err)) {
        console.warn(`[api] ${path} answered 503, the database is not reachable: ${describeDbError(err)}`);
        return NextResponse.json(
          { ok: false, error: "database_unavailable", retryAfter: 10 },
          { status: 503, headers: { "retry-after": "10" } },
        );
      }
      // Anything else is a real failure and deserves the error log, but the
      // client still gets a JSON body rather than an empty 500.
      console.error(`[api] ${path} failed`, err);
      return apiError(500, "server_error");
    }
  };
}

export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}
