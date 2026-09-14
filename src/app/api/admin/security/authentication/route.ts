import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveMfaPolicy } from "@/lib/admin/security";
import { mfaPolicySchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// The second-factor policy. Owner only: it decides what a password alone is
// worth, which is not something an Admin should be able to lower.
export const POST = adminRoute({ auth: "required", permission: "settings:owner", schema: mfaPolicySchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await saveMfaPolicy(body, { user: auth.user, ipHash });
  return apiOk({ auth_policy: body });
});
