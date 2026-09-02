import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { revokeInvite } from "@/lib/auth/flows";
import { inviteIdSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: inviteIdSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const done = await revokeInvite(auth.user, body.inviteId, { ipHash, userAgent });
  if (!done) return apiError(404, "not_found");
  return apiOk();
});
