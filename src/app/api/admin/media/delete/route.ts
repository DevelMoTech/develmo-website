import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteMedia } from "@/lib/admin/media";
import { mediaDeleteSchema } from "@/lib/schemas/media";

export const runtime = "nodejs";

// Refuses while the file is referenced anywhere (brief §3.10).
export const POST = adminRoute({ auth: "required", permission: "media:write", schema: mediaDeleteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await deleteMedia(body.id, { user: auth.user, ipHash });
  if (!result.ok) {
    if (result.code === "in_use") return apiError(409, "in_use", { usage: result.usage });
    return apiError(404, result.code);
  }
  return apiOk();
});
