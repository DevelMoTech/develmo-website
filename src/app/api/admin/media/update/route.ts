import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { updateMedia } from "@/lib/admin/media";
import { mediaUpdateSchema } from "@/lib/schemas/media";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "media:write", schema: mediaUpdateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await updateMedia(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(404, result.code);
  return apiOk({ media: result.media });
});
