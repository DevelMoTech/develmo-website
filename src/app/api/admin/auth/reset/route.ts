import { adminRoute, apiError, apiOk, rateLimited } from "@/lib/auth/api";
import { resetPassword } from "@/lib/auth/flows";
import { consumeLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { resetPasswordSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "none", schema: resetPasswordSchema }, async ({ body, ip, ipHash, userAgent }) => {
  const limit = await consumeLimit("reset", ip);
  if (limit.limited) return rateLimited(retryAfterSeconds(limit));
  const result = await resetPassword(body, { ipHash, userAgent });
  if (!result.ok) return apiError(400, `reset_${result.reason}`);
  return apiOk({ redirectTo: "/admin/login?notice=reset" });
});
