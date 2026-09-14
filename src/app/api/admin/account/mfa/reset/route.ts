import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { resetOwnMfa } from "@/lib/auth/flows";
import { getMfaPolicy, mustEnrol } from "@/lib/auth/policy";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ currentPassword: z.string().min(1).max(200) });

// Disables the authenticator after password re-authentication. Roles that
// require MFA are sent straight back into enrolment.
export const POST = adminRoute({ auth: "required", schema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await resetOwnMfa(auth, body.currentPassword, { ipHash, userAgent });
  if (!result.ok) return apiError(400, "invalid_current");
  return apiOk({ redirectTo: mustEnrol(await getMfaPolicy(), { role: auth.user.role, totpEnabled: false }) ? "/admin/mfa/enrol" : null });
});
