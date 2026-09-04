import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveAccessRule, SECURITY_PERMISSION } from "@/lib/admin/security";
import { accessRuleSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Create or update an IP or CIDR rule (brief §3.7). Blocking a range that
// covers the caller's own address is refused unless that address is typed
// back; the check runs here, so calling the API directly does not skip it.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: accessRuleSchema }, async ({ auth, body, ip, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveAccessRule(body, { user: auth.user, ipHash }, ip);
  if (!result.ok) return apiError(result.error === "not_found" ? 404 : 400, result.error, result.detail ? { detail: result.detail, yourIp: ip } : {});
  return apiOk({ id: result.id });
});
