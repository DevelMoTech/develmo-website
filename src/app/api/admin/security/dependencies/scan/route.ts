import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { recordDependencyAudit, SECURITY_PERMISSION } from "@/lib/admin/security";

export const runtime = "nodejs";
export const maxDuration = 120;

// Runs the dependency scan on demand. The cron runs the same function daily.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION }, async ({ auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await recordDependencyAudit({ user: auth.user, ipHash });
  if (!result.ok) return apiError(502, "scan_failed", { detail: result.error });
  return apiOk({ summary: result.summary });
});
