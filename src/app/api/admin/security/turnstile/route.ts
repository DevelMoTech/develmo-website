import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveTurnstile, SECURITY_PERMISSION } from "@/lib/admin/security";
import { turnstileSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// The Turnstile toggle and site key (brief §3.7). Site keys are public by
// design and are the only part stored; the secret stays in the environment
// as TURNSTILE_SECRET_KEY and is never read back to the browser.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: turnstileSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveTurnstile(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, result.error);
  return apiOk();
});
