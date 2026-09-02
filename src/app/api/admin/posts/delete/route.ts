import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deletePosts } from "@/lib/admin/posts";
import { postDeleteSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: postDeleteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const { deleted } = await deletePosts([body.id], { user: auth.user, ipHash });
  if (deleted === 0) return apiError(404, "not_found");
  return apiOk();
});
