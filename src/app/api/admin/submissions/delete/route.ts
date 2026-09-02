import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteSubmission } from "@/lib/admin/submissions";
import { submissionIdSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

// Hard delete for retention requests; Admin and Owner only.
export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: submissionIdSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const ok = await deleteSubmission(body.id, { user: auth.user, ipHash });
  if (!ok) return apiError(404, "not_found");
  return apiOk();
});
