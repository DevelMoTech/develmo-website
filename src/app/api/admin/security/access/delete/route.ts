import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteAccessRule, SECURITY_PERMISSION } from "@/lib/admin/security";
import { idSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: idSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const removed = await deleteAccessRule(body.id, { user: auth.user, ipHash });
  if (!removed) return apiError(404, "not_found");
  return apiOk();
});
