import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { getSetting } from "@/lib/admin/settings";
import { siteUrl } from "@/lib/email";
import { deliverNotice } from "@/lib/notify";

export const runtime = "nodejs";

// Sends a real message to the configured admin address through the same
// chain the access request notification uses, and reports exactly what
// happened. Deliverability is checked, not assumed.
export const POST = adminRoute({ auth: "required", permission: "settings:write" }, async ({ auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const { notifyEmail } = await getSetting("access_requests");
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const outcome = await deliverNotice({
    to: notifyEmail,
    subject: "DevelMo admin console: test email",
    text: [
      `This is a test sent from the DevelMo admin console by ${auth.user.email} at ${when}.`,
      "",
      "If you are reading it, notifications about access requests will reach this address.",
      "",
      `Console: ${siteUrl()}/admin/settings/email`,
    ].join("\n"),
    fields: { sentBy: auth.user.email, sentAt: when, purpose: "Delivery test from the admin console" },
  });
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "settings.email.test", entityType: "settings", entityId: "access_requests", after: { to: notifyEmail, ...outcome }, ipHash });
  return apiOk({ to: notifyEmail, outcome });
});
