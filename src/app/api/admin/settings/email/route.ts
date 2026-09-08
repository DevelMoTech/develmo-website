import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { accessNotifySchema } from "@/lib/schemas/access";

export const runtime = "nodejs";

// Which address is told about a new access request.
export const POST = adminRoute({ auth: "required", permission: "settings:write", schema: accessNotifySchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const before = await getSetting("access_requests");
  await setSetting("access_requests", body, auth.user.id);
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "settings.access_requests", entityType: "settings", entityId: "access_requests", before, after: body, ipHash });
  return apiOk({ access_requests: body });
});
