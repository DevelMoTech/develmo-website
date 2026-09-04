import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { applyUserAction, SECURITY_PERMISSION } from "@/lib/admin/security";
import { securityEvent } from "@/lib/auth/log";
import { userActionSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Force logout, force password reset, force MFA re-enrolment, lock and
// unlock (brief §3.7). Admins cannot act on an Owner, and nobody can lock
// themselves out; both refusals are enforced here.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: userActionSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await applyUserAction(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "refused", { detail: result.error });
  if (body.action === "lock" || body.action === "unlock") {
    await securityEvent({ type: body.action === "lock" ? "account_locked" : "account_unlocked", userId: body.userId, ipHash, path: "/admin/security/sessions", userAgent, meta: { by: auth.user.email } });
  }
  return apiOk({ message: result.message });
});
