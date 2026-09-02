import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { rejectionResponse, storeNewMedia } from "@/lib/admin/media";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { altTextSchema, folderSchema } from "@/lib/schemas/media";
import { tagsSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

// Multipart upload. The body is read here (rawBody) so bytes can be sniffed
// before anything touches storage; the CSRF token travels in the header.
export const POST = adminRoute({ auth: "required", permission: "media:write", rawBody: true }, async ({ req, auth, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return apiError(413, "too_large", { maxBytes: MAX_UPLOAD_BYTES });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!fd || !(file instanceof File)) return apiError(400, "invalid", { issues: [{ path: "file", message: "Choose a file" }] });
  const folder = folderSchema.safeParse(String(fd.get("folder") ?? ""));
  const altText = altTextSchema.safeParse(String(fd.get("altText") ?? ""));
  const tags = tagsSchema.safeParse(String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  if (!folder.success || !altText.success || !tags.success) {
    return apiError(400, "invalid", {
      issues: [
        ...(folder.success ? [] : [{ path: "folder", message: folder.error.issues[0]?.message ?? "Invalid" }]),
        ...(altText.success ? [] : [{ path: "altText", message: altText.error.issues[0]?.message ?? "Invalid" }]),
        ...(tags.success ? [] : [{ path: "tags", message: tags.error.issues[0]?.message ?? "Invalid" }]),
      ],
    });
  }
  const result = await storeNewMedia(file, { altText: altText.data, folder: folder.data, tags: tags.data }, { user: auth.user, ipHash, userAgent, path: "/api/admin/media/upload" });
  if (!result.ok) return rejectionResponse(result);
  return apiOk({ media: result.media });
});
