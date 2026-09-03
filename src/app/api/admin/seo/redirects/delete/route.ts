import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteRedirect } from "@/lib/admin/seo";
import { idSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: idSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const ok = await deleteRedirect(body.id, { user: auth.user, ipHash });
  if (!ok) return apiError(404, "not_found");
  return apiOk();
});
