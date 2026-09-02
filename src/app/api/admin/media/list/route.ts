import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { listFolders, listMedia, MEDIA_PAGE_SIZE, toView } from "@/lib/admin/media";
import { mediaListQuerySchema } from "@/lib/schemas/media";

export const runtime = "nodejs";

// JSON listing for the image picker inside the post editor.
export const GET = adminRoute({ auth: "required", permission: "media:read" }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const parsed = mediaListQuerySchema.safeParse(Object.fromEntries(sp.entries()));
  if (!parsed.success) return apiError(400, "invalid");
  const { rows, total } = await listMedia(parsed.data);
  const folders = await listFolders();
  return apiOk({ items: rows.map(toView), total, page: parsed.data.page, pageSize: MEDIA_PAGE_SIZE, folders });
});
