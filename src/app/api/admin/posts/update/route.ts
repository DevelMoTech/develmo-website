import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { postErrorResponse } from "@/lib/admin/post-errors";
import { updatePost } from "@/lib/admin/posts";
import { postUpdateSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: postUpdateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await updatePost(body, { user: auth.user, ipHash });
  if (!result.ok) return postErrorResponse(result);
  return apiOk({ redirectCreated: result.redirectCreated });
});
