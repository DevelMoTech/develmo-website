import { adminRoute, apiError, apiOk, rateLimited, setSessionCookie } from "@/lib/auth/api";
import { verifyMfa } from "@/lib/auth/flows";
import { mfaRequired } from "@/lib/auth/rbac";
import { mfaVerifySchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "mfa-pending", schema: mfaVerifySchema }, async ({ auth, body, ip, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const next = body.next ?? "/admin";
  if (!auth.session.mfaPending) return apiOk({ redirectTo: next });
  const result = await verifyMfa(auth, body.code, ip, { ipHash, userAgent });
  if (!result.ok) {
    if (result.code === "rate_limited") return rateLimited(result.retryAfter);
    return apiError(401, "invalid_code");
  }
  const { user } = auth;
  let redirectTo = next;
  if (user.mustChangePassword) redirectTo = "/admin/account?required=password";
  else if (mfaRequired(user.role) && !user.totpEnabled) redirectTo = "/admin/mfa/enrol";
  const res = apiOk({ redirectTo });
  setSessionCookie(res, result.token, auth.session.absoluteExpiresAt);
  return res;
});
