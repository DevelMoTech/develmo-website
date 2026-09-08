import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { notifyAdminOfRequest } from "@/lib/auth/access-requests";
import { audit } from "@/lib/auth/log";
import { accessRequestIdSchema } from "@/lib/schemas/access";

export const runtime = "nodejs";

// Sends the admin notification for a request again, for when the first
// attempt failed or nobody read it. Same authority as deciding the request.
export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: accessRequestIdSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const outcome = await notifyAdminOfRequest(body.id);
  if (!outcome) return apiError(404, "not_found");
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "access_request.notify", entityType: "access_request", entityId: body.id, after: outcome, ipHash });
  return apiOk({ outcome });
});
