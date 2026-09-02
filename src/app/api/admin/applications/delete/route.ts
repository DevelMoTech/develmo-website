import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { deleteApplication } from "@/lib/admin/applications";
import { applicationDeleteSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

// Hard delete for retention requests; Admin and Owner only.
export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: applicationDeleteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const ok = await deleteApplication(body.id, { user: auth.user, ipHash });
  if (!ok) return apiError(404, "not_found");
  return apiOk();
});
