import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { revalidatePathNow } from "@/lib/admin/performance";
import { revalidatePathSchema } from "@/lib/schemas/performance";

export const runtime = "nodejs";

// The manual escape hatch (brief §3.8): publishing elsewhere already busts
// the right tag, this is for when a page is stale anyway.
export const POST = adminRoute({ auth: "required", permission: "performance:write", schema: revalidatePathSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await revalidatePathNow(body, { user: auth.user, ipHash });
  return apiOk({ path: body.path, type: body.type });
});
