import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { postErrorResponse } from "@/lib/admin/post-errors";
import { restoreRevision } from "@/lib/admin/posts";
import { postRestoreSchema } from "@/lib/schemas/post";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: postRestoreSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await restoreRevision(body.postId, body.revisionId, { user: auth.user, ipHash });
  if (!result.ok) return postErrorResponse(result);
  return apiOk({ slugKept: result.slugKept });
});
