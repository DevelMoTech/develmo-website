import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { rejectionResponse, replaceMedia } from "@/lib/admin/media";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { mediaIdSchema } from "@/lib/schemas/media";

export const runtime = "nodejs";

// Replace the bytes behind an existing file, keeping its URL.
export const POST = adminRoute({ auth: "required", permission: "media:write", rawBody: true }, async ({ req, auth, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return apiError(413, "too_large", { maxBytes: MAX_UPLOAD_BYTES });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  const id = mediaIdSchema.safeParse({ id: fd?.get("id") });
  if (!fd || !(file instanceof File) || !id.success) return apiError(400, "invalid", { issues: [{ path: "file", message: "Choose a file" }] });
  const result = await replaceMedia(id.data.id, file, { user: auth.user, ipHash, userAgent, path: "/api/admin/media/replace" });
  if (!result.ok) {
    if (result.code === "not_found") return apiError(404, "not_found");
    return rejectionResponse(result);
  }
  return apiOk({ media: result.media });
});
