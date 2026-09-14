import { adminRoute, apiError, apiOk, rateLimited, setSessionCookie } from "@/lib/auth/api";
import { verifyMfa } from "@/lib/auth/flows";
import { getMfaPolicy, mustEnrol, stillPending } from "@/lib/auth/policy";
import { mfaVerifySchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "mfa-pending", schema: mfaVerifySchema }, async ({ auth, body, ip, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const next = body.next ?? "/admin";
  const policy = await getMfaPolicy();
  if (!stillPending(policy, auth.session.mfaPending)) return apiOk({ redirectTo: next });
  const result = await verifyMfa(auth, body.code, ip, { ipHash, userAgent });
  if (!result.ok) {
    if (result.code === "rate_limited") return rateLimited(result.retryAfter);
    // The reason travels with the refusal so the form can say what to do. It
    // never says what a right code would be, and the attempt still counts
    // against the limiter.
    return apiError(401, "invalid_code", { kind: result.kind, reason: result.reason, driftSeconds: result.driftSeconds });
  }
  const { user } = auth;
  let redirectTo = next;
  if (user.mustChangePassword) redirectTo = "/admin/account?required=password";
  else if (mustEnrol(policy, user)) redirectTo = "/admin/mfa/enrol";
  const res = apiOk({ redirectTo });
  setSessionCookie(res, result.token, auth.session.absoluteExpiresAt);
  return res;
});
