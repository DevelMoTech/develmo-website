import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { resetRateLimit, SECURITY_PERMISSION } from "@/lib/admin/security";
import { EDITABLE_LIMITS } from "@/lib/schemas/security";

export const runtime = "nodejs";

const schema = z.object({ key: z.enum(EDITABLE_LIMITS) });

// Removes the stored row so the code default applies again.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await resetRateLimit(body.key, { user: auth.user, ipHash });
  return apiOk();
});
