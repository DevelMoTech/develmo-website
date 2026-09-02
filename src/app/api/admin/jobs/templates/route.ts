import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { getTemplate, saveTemplate, TEMPLATE_KEYS } from "@/lib/admin/templates";
import { emailTemplatesSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

// Applicant email templates (acknowledgement, rejection).
export const POST = adminRoute({ auth: "required", permission: "content:write", schema: emailTemplatesSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  for (const key of TEMPLATE_KEYS) {
    const before = await getTemplate(key);
    const next = body[key];
    if (before.subject === next.subject && before.body === next.body) continue;
    await saveTemplate(key, next, auth.user.id);
    await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "email_template.update", entityType: "email_template", entityId: key, before, after: next, ipHash });
  }
  return apiOk();
});
