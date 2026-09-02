import { adminRoute, apiError, apiOk, setSessionCookie } from "@/lib/auth/api";
import { changePassword } from "@/lib/auth/flows";
import { mfaRequired } from "@/lib/auth/rbac";
import { changePasswordSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", schema: changePasswordSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await changePassword(auth, body, { ipHash, userAgent });
  if (!result.ok) return apiError(400, result.code);
  const { user } = auth;
  const redirectTo = mfaRequired(user.role) && !user.totpEnabled ? "/admin/mfa/enrol" : null;
  const res = apiOk({ redirectTo });
  setSessionCookie(res, result.token, auth.session.absoluteExpiresAt);
  return res;
});
