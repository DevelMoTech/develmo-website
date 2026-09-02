import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { createInvite } from "@/lib/auth/flows";
import { inviteSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: inviteSchema }, async ({ auth, body, ipHash, userAgent, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await createInvite(auth.user, { email: body.email, role: body.role, baseUrl }, { ipHash, userAgent });
  if (!result.ok) return apiError(result.code === "forbidden" ? 403 : 409, result.code);
  return apiOk({ inviteId: result.inviteId, url: result.url, expiresAt: result.expiresAt.toISOString(), emailed: result.emailed });
});
