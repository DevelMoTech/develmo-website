import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveOverride } from "@/lib/admin/seo";
import { overrideSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// Per-route metadata and sitemap override (brief §3.6). Live on the public
// route with the next request: the save busts the repo cache tags.
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: overrideSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveOverride(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, result.error);
  return apiOk({ cleared: result.cleared });
});
