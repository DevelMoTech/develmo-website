import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteUser } from "@/lib/auth/flows";
import { deleteUserSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Destructive: requires the target's email typed as confirmation.
export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: deleteUserSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await deleteUser(auth.user, body, { ipHash, userAgent });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "confirm" ? 400 : 403;
    return apiError(status, result.code);
  }
  return apiOk();
});
