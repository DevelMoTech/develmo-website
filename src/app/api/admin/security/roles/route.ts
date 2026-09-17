import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveRoleAccess, SECURITY_PERMISSION } from "@/lib/admin/security";
import { roleAccessSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Which console features each role may use. Needs both the security
// permission that gates the module and the settings permission that gates
// changing configuration, so a role that can only read security cannot
// rewrite the rules it is read under.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: roleAccessSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveRoleAccess(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(403, result.error);
  return apiOk({ role_access: result.saved });
});
