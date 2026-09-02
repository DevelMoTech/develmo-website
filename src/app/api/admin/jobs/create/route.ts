import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { jobErrorResponse } from "@/lib/admin/job-errors";
import { createJob } from "@/lib/admin/jobs";
import { jobCreateSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "content:write", schema: jobCreateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await createJob(body, { user: auth.user, ipHash });
  if (!result.ok) return jobErrorResponse(result);
  return apiOk({ id: result.id });
});
