import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { securityEvent } from "@/lib/auth/log";
import { revokeOtherSessions } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required" }, async ({ auth, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const n = await revokeOtherSessions(auth.user.id, auth.session.id);
  await securityEvent({ type: "session_revoked", userId: auth.user.id, email: auth.user.email, ipHash, userAgent, meta: { others: n } });
  return apiOk({ revoked: n });
});
