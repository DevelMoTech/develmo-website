import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { resetRobots } from "@/lib/admin/seo";
import { DEFAULT_ROBOTS_BODY, renderRobots } from "@/lib/seo/robots";

export const runtime = "nodejs";

// Back to the file the site shipped with.
export const POST = adminRoute({ auth: "required", permission: "seo:write" }, async ({ auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await resetRobots({ user: auth.user, ipHash });
  return apiOk({ body: DEFAULT_ROBOTS_BODY, rendered: renderRobots(DEFAULT_ROBOTS_BODY) });
});
