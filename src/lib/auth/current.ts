import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientIp, hashIp } from "./ip";
import { DatabaseUnavailableError, isDatabaseUnavailable } from "@/db/errors";
import { CSRF_COOKIE, SESSION_COOKIE, loadSession, type SessionWithUser } from "./session";
import type { Permission } from "./rbac";
import { getMfaPolicy, mustEnrol, stillPending } from "./policy";
import { allowsFor, type Allows } from "./role-access";

// Session for the current request, deduplicated per render. An unreachable
// database is reported as such rather than as a raw query failure, so a page
// gate can tell an outage from a signed-out visitor.
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const c = await cookies();
  try {
    return await loadSession(c.get(SESSION_COOKIE)?.value);
  } catch (err) {
    if (isDatabaseUnavailable(err)) throw new DatabaseUnavailableError(err);
    throw err;
  }
});

// For pages that only use the session to be helpful, such as sending an
// already signed-in visitor away from the sign-in form, or reading a theme
// preference: during an outage they carry on as if nobody were signed in.
export async function getCurrentSessionIfReachable(): Promise<SessionWithUser | null> {
  try {
    return await getCurrentSession();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return null;
    throw err;
  }
}

// CSRF token to embed in forms. The proxy issues the cookie and mirrors it
// into a request header so the very first render already has it.
export async function getCsrfToken(): Promise<string> {
  const h = await headers();
  const fromProxy = h.get("x-dm-csrf");
  if (fromProxy) return fromProxy;
  const c = await cookies();
  return c.get(CSRF_COOKIE)?.value ?? "";
}

// Salted hash of the requesting IP, for audit rows written by pages.
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  return hashIp(getClientIp(h));
}

export function loginRedirect(path: string): never {
  redirect(`/admin/login?next=${encodeURIComponent(path)}`);
}

// Page gate. Every admin page calls this first with its own path. It enforces,
// in order: signed in, MFA challenge completed, forced password change done,
// mandatory MFA enrolled, then the page's permission.
//
// It also hands back `allows`, the role's permissions as the console is
// configured right now (Security, Roles and access). Pages use it to decide
// which controls to render, so what a page offers and what its API will
// accept are answered from the same place.
export async function requirePageUser(
  path: string,
  opts: {
    permission?: Permission;
    allowMfaPending?: boolean;
    allowMustChangePassword?: boolean;
    allowMfaUnenrolled?: boolean;
  } = {},
): Promise<SessionWithUser & { allows: Allows }> {
  let auth: SessionWithUser | null;
  try {
    auth = await getCurrentSession();
  } catch (err) {
    // The session could not be checked, which is not the same as no session.
    // The sign-in page says so, keeps the destination, and the cookie is
    // left alone: once the database is back the next visit just works.
    if (err instanceof DatabaseUnavailableError) redirect(`/admin/login?notice=database&next=${encodeURIComponent(path)}`);
    throw err;
  }
  if (!auth) loginRedirect(path);
  const { session, user } = auth;
  const policy = await getMfaPolicy();
  const pending = stillPending(policy, session.mfaPending);
  if (pending && !opts.allowMfaPending) {
    redirect(`/admin/mfa/verify?next=${encodeURIComponent(path)}`);
  }
  if (!pending) {
    if (user.mustChangePassword && !opts.allowMustChangePassword) {
      redirect("/admin/account?required=password");
    }
    if (mustEnrol(policy, user) && !opts.allowMfaUnenrolled && !user.mustChangePassword) {
      redirect("/admin/mfa/enrol");
    }
  }
  const allows = await allowsFor(user.role);
  if (opts.permission && !allows(opts.permission)) {
    redirect(`/admin?denied=${encodeURIComponent(opts.permission)}`);
  }
  return { ...auth, allows };
}
