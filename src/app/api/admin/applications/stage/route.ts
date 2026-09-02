import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { changeStage } from "@/lib/admin/applications";
import { applicationStageSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: applicationStageSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await changeStage(body.id, body.stage, body.note, { user: auth.user, ipHash });
  if (!result.ok) return apiError(404, result.code);
  return apiOk({ changed: result.changed });
});
