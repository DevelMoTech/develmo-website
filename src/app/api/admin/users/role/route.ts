import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { changeUserRole } from "@/lib/auth/flows";
import { changeRoleSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: changeRoleSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await changeUserRole(auth.user, body, { ipHash, userAgent });
  if (!result.ok) return apiError(result.code === "not_found" ? 404 : 403, result.code);
  return apiOk();
});
