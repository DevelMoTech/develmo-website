import { adminRoute, apiError, apiOk, setSessionCookie } from "@/lib/auth/api";
import { confirmTotpEnrolment } from "@/lib/auth/flows";
import { mfaEnrolConfirmSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Confirms the pending secret shown on /admin/mfa/enrol with a first code.
export const POST = adminRoute({ auth: "required", schema: mfaEnrolConfirmSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await confirmTotpEnrolment(auth, body.code, { ipHash, userAgent });
  if (!result.ok) {
    if (result.code === "not_started") return apiError(409, "not_started");
    // Why, so the form can say "your clock is four minutes fast" rather than
    // leaving the person to guess.
    return apiError(401, "invalid_code", { kind: "totp", reason: result.reason, driftSeconds: result.driftSeconds });
  }
  const res = apiOk({ recoveryCodes: result.recoveryCodes, redirectTo: "/admin" });
  setSessionCookie(res, result.token, auth.session.absoluteExpiresAt);
  return res;
});
