import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { clearOverride } from "@/lib/admin/seo";
import { pathSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: pathSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const cleared = await clearOverride(body.path, { user: auth.user, ipHash });
  if (!cleared) return apiError(404, "not_found");
  return apiOk();
});
