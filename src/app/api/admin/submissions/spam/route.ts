import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { setSpam } from "@/lib/admin/submissions";
import { submissionSpamSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

// Mark as spam, or restore ("not spam"); restoring a held enquiry delivers it.
export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: submissionSpamSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await setSpam(body.id, body.spam, { user: auth.user, ipHash });
  if (!result.ok) return apiError(404, result.code);
  return apiOk({ delivery: result.delivery });
});
