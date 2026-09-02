import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { getSetting, replyTemplateSchema, setSetting } from "@/lib/admin/settings";

export const runtime = "nodejs";

// The mailto: reply template for the inbox (brief §3.5).
export const POST = adminRoute({ auth: "required", permission: "settings:write", schema: replyTemplateSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const before = await getSetting("reply_template");
  await setSetting("reply_template", body, auth.user.id);
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "settings.reply_template", entityType: "settings", entityId: "reply_template", before, after: body, ipHash });
  return apiOk();
});
