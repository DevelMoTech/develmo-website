import { adminRoute, apiError, apiOk, rateLimited, setSessionCookie } from "@/lib/auth/api";
import { login } from "@/lib/auth/flows";
import { loginSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "none", schema: loginSchema }, async ({ body, ip, ipHash, userAgent }) => {
  const result = await login({ email: body.email, password: body.password, ip }, { ipHash, userAgent });
  if (!result.ok) {
    if (result.code === "rate_limited") return rateLimited(result.retryAfter);
    // One generic answer for unknown email, wrong password and locked accounts.
    return apiError(401, "invalid_credentials");
  }
  const next = body.next ?? "/admin";
  let redirectTo = next;
  if (result.mfaPending) redirectTo = `/admin/mfa/verify?next=${encodeURIComponent(next)}`;
  else if (result.mustChangePassword) redirectTo = "/admin/account?required=password";
  else if (result.needsMfaEnrolment) redirectTo = "/admin/mfa/enrol";
  const res = apiOk({ redirectTo });
  setSessionCookie(res, result.token, result.expires);
  return res;
});
