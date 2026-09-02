import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { postErrorResponse } from "@/lib/admin/post-errors";
import { createPost } from "@/lib/admin/posts";
import { postCreateSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: postCreateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await createPost(body, { user: auth.user, ipHash });
  if (!result.ok) return postErrorResponse(result);
  return apiOk({ id: result.id });
});
