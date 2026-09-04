import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { reorderEntries } from "@/lib/admin/content";
import { reorderSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";

// Order is what the public list pages render in, so it is content too.
export const POST = adminRoute({ auth: "required", permission: "content:write", schema: reorderSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await reorderEntries(body.entity, body.keys, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, result.error);
  return apiOk();
});
