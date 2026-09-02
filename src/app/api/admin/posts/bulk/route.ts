import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { bulkUpdate, deletePosts } from "@/lib/admin/posts";
import { postBulkSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: postBulkSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const actor = { user: auth.user, ipHash };
  if (body.action === "delete") {
    const { deleted } = await deletePosts(body.ids, actor);
    return apiOk({ changed: deleted });
  }
  const { changed } = await bulkUpdate(body.ids, body.action, { addTags: body.addTags, removeTags: body.removeTags }, actor);
  return apiOk({ changed });
});
