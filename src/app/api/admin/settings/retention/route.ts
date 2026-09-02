import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { getSetting, retentionSchema, setSetting } from "@/lib/admin/settings";

export const runtime = "nodejs";

// Retention windows for submissions and applications (brief §3.5).
export const POST = adminRoute({ auth: "required", permission: "settings:write", schema: retentionSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const before = await getSetting("retention");
  await setSetting("retention", body, auth.user.id);
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "settings.retention", entityType: "settings", entityId: "retention", before, after: body, ipHash });
  return apiOk({ retention: body });
});
