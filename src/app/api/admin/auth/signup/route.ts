import { adminRoute, apiError, apiOk, rateLimited, setSessionCookie } from "@/lib/auth/api";
import { redeemInvite } from "@/lib/auth/flows";
import { consumeLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { signupSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Invite redemption. There is no open signup: without a valid single-use
// invite token this endpoint creates nothing.
export const POST = adminRoute({ auth: "none", schema: signupSchema }, async ({ body, ip, ipHash, userAgent }) => {
  const limit = await consumeLimit("signup", ip);
  if (limit.limited) return rateLimited(retryAfterSeconds(limit));
  const result = await redeemInvite(body, { ipHash, userAgent });
  if (!result.ok) return apiError(400, `invite_${result.reason}`);
  const res = apiOk({ redirectTo: result.needsMfaEnrolment ? "/admin/mfa/enrol" : "/admin" });
  setSessionCookie(res, result.token, result.expires);
  return res;
});
