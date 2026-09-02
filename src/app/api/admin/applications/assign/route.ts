import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { assign } from "@/lib/admin/applications";
import { applicationAssignSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: applicationAssignSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await assign(body.id, body.assigneeId, { user: auth.user, ipHash });
  if (!result.ok) return apiError(result.code === "not_found" ? 404 : 400, result.code);
  return apiOk();
});
