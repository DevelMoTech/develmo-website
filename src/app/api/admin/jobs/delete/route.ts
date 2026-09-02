import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { jobErrorResponse } from "@/lib/admin/job-errors";
import { deleteJob } from "@/lib/admin/jobs";
import { jobDeleteSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: jobDeleteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await deleteJob(body.id, { user: auth.user, ipHash });
  if (!result.ok) return jobErrorResponse(result);
  return apiOk();
});
