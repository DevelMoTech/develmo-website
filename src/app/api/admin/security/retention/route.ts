import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { SECURITY_PERMISSION } from "@/lib/admin/security";
import { audit } from "@/lib/auth/log";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { securityRetentionSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// How long security events are kept before the cron deletes them. The audit
// log is separate and is never deleted, for any role.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: securityRetentionSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const before = await getSetting("security_retention");
  await setSetting("security_retention", body, auth.user.id);
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "security.retention.update", entityType: "settings", entityId: "security_retention", before, after: body, ipHash });
  return apiOk();
});
