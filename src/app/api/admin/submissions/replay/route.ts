import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { replayDelivery } from "@/lib/admin/submissions";
import { submissionIdSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

// Re-runs the delivery chain for a row (brief §3.5 "replay delivery").
export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: submissionIdSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const outcome = await replayDelivery(body.id, { user: auth.user, ipHash });
  if (!outcome) return apiError(404, "not_found");
  if (outcome === "not_deliverable") return apiError(409, "not_deliverable");
  return apiOk({ delivery: outcome });
});
