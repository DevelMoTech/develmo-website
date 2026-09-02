import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CSRF_COOKIE, SESSION_COOKIE, loadSession, type SessionWithUser } from "./session";
import { can, mfaRequired, type Permission } from "./rbac";

// Session for the current request, deduplicated per render.
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const c = await cookies();
  return loadSession(c.get(SESSION_COOKIE)?.value);
});

// CSRF token to embed in forms. The proxy issues the cookie and mirrors it
// into a request header so the very first render already has it.
export async function getCsrfToken(): Promise<string> {
  const h = await headers();
  const fromProxy = h.get("x-dm-csrf");
  if (fromProxy) return fromProxy;
  const c = await cookies();
  return c.get(CSRF_COOKIE)?.value ?? "";
}

export function loginRedirect(path: string): never {
  redirect(`/admin/login?next=${encodeURIComponent(path)}`);
}

// Page gate. Every admin page calls this first with its own path. It enforces,
// in order: signed in, MFA challenge completed, forced password change done,
// mandatory MFA enrolled, then the page's permission.
export async function requirePageUser(
  path: string,
  opts: {
    permission?: Permission;
    allowMfaPending?: boolean;
    allowMustChangePassword?: boolean;
    allowMfaUnenrolled?: boolean;
  } = {},
): Promise<SessionWithUser> {
  const auth = await getCurrentSession();
  if (!auth) loginRedirect(path);
  const { session, user } = auth;
  if (session.mfaPending && !opts.allowMfaPending) {
    redirect(`/admin/mfa/verify?next=${encodeURIComponent(path)}`);
  }
  if (!session.mfaPending) {
    if (user.mustChangePassword && !opts.allowMustChangePassword) {
      redirect("/admin/account?required=password");
    }
    if (mfaRequired(user.role) && !user.totpEnabled && !opts.allowMfaUnenrolled && !user.mustChangePassword) {
      redirect("/admin/mfa/enrol");
    }
  }
  if (opts.permission && !can(user.role, opts.permission)) {
    redirect(`/admin?denied=${encodeURIComponent(opts.permission)}`);
  }
  return auth;
}
