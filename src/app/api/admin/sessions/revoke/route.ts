import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { securityEvent } from "@/lib/auth/log";
import { revokeSession } from "@/lib/auth/session";
import { revokeSessionSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Revokes one of the caller's own sessions. Takes effect on that session's
// next request. Revoking the current session behaves like signing out.
export const POST = adminRoute({ auth: "required", schema: revokeSessionSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const done = await revokeSession(body.sessionId, auth.user.id);
  if (!done) return apiError(404, "not_found");
  await securityEvent({ type: "session_revoked", userId: auth.user.id, email: auth.user.email, ipHash, userAgent, meta: { sessionId: body.sessionId, self: body.sessionId === auth.session.id } });
  return apiOk({ redirectTo: body.sessionId === auth.session.id ? "/admin/login?notice=signed_out" : null });
});
