import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { updateSubmission } from "@/lib/admin/submissions";
import { submissionUpdateSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

// Status, assignment and tags in one call; each change is audited separately.
export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: submissionUpdateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await updateSubmission(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(result.code === "not_found" ? 404 : 400, result.code);
  return apiOk({ delivery: result.delivery });
});
