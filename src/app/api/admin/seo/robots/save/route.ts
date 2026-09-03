import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveRobots } from "@/lib/admin/seo";
import { robotsBodySchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// robots.txt body (brief §3.6). Structural errors block the save; the served
// file always carries the /admin and /api/admin disallows regardless.
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: robotsBodySchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveRobots(body.body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "invalid_robots", { errors: result.errors, warnings: result.warnings });
  return apiOk({ rendered: result.rendered, warnings: result.warnings });
});
