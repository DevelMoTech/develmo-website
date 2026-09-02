import { adminRoute, apiOk, clearSessionCookie } from "@/lib/auth/api";
import { logout } from "@/lib/auth/flows";

export const runtime = "nodejs";

// A half-authenticated (MFA pending) session may also sign out.
export const POST = adminRoute({ auth: "mfa-pending" }, async ({ auth, ipHash, userAgent }) => {
  if (auth) await logout(auth, { ipHash, userAgent });
  const res = apiOk({ redirectTo: "/admin/login?notice=signed_out" });
  clearSessionCookie(res);
  return res;
});
