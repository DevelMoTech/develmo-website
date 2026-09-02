import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { resendInvite } from "@/lib/auth/flows";
import { inviteIdSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: inviteIdSchema }, async ({ auth, body, ipHash, userAgent, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await resendInvite(auth.user, body.inviteId, baseUrl, { ipHash, userAgent });
  if (!result.ok) return apiError(404, "not_found");
  return apiOk({ url: result.url, emailed: result.emailed });
});
