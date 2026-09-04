import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { revalidateTagNow } from "@/lib/admin/performance";
import { revalidateTagSchema } from "@/lib/schemas/performance";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "performance:write", schema: revalidateTagSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await revalidateTagNow(body.tag, { user: auth.user, ipHash });
  return apiOk({ tag: body.tag });
});
