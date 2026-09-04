import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { revokeSession, SECURITY_PERMISSION } from "@/lib/admin/security";
import { securityEvent } from "@/lib/auth/log";
import { sessionRevokeSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Revoke one session anywhere in the estate. The holder is signed out on
// their next request, because every request revalidates the session row.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: sessionRevokeSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const revoked = await revokeSession(body.sessionId, { user: auth.user, ipHash });
  if (!revoked) return apiError(404, "not_found");
  await securityEvent({ type: "session_revoked", userId: auth.user.id, email: auth.user.email, ipHash, path: "/admin/security/sessions", userAgent, meta: { sessionId: body.sessionId, by: "security_manager" } });
  return apiOk();
});
