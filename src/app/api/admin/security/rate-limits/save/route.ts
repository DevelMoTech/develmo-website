import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveRateLimit, SECURITY_PERMISSION } from "@/lib/admin/security";
import { rateLimitSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Per-endpoint limits (brief §3.7). The limiter reads its configuration
// through a 30 second cache, so a change is in force within that window on
// every instance, without a restart or a deploy.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: rateLimitSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await saveRateLimit(body, { user: auth.user, ipHash });
  return apiOk();
});
