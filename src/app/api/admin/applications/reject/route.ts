import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { sendRejection } from "@/lib/admin/applications";
import { saveTemplate } from "@/lib/admin/templates";
import { audit } from "@/lib/auth/log";
import { applicationRejectSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

// Manual rejection email from the editable template (brief §3.4).
export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: applicationRejectSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const actor = { user: auth.user, ipHash };
  if (body.saveAsTemplate) {
    await saveTemplate("application_rejection", { subject: body.subject, body: body.body }, auth.user.id);
    await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "email_template.update", entityType: "email_template", entityId: "application_rejection", after: { subject: body.subject, body: body.body }, ipHash });
  }
  const result = await sendRejection(body.id, body.subject, body.body, actor);
  if (!result.ok) return apiError(404, result.code);
  return apiOk({ sent: result.sent, error: result.error ?? null });
});
