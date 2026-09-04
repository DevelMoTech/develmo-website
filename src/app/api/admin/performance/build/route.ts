import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { recordBuildStats } from "@/lib/admin/performance";

export const runtime = "nodejs";

// Stores this deployment's build stats so the next build has something to
// be compared against.
export const POST = adminRoute({ auth: "required", permission: "performance:write" }, async ({ auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await recordBuildStats({ user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "not_recorded", { detail: result.error });
  return apiOk({ routes: result.routes, buildId: result.buildId });
});
