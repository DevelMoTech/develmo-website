import { after } from "next/server";
import { adminRoute, apiError, apiOk, rateLimited } from "@/lib/auth/api";
import { prepareEmailChange } from "@/lib/auth/flows";
import { sendEmail } from "@/lib/email";
import { changeEmailSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Requests an email change: re-authenticates with the current password and
// sends a single-use confirmation link to the new address.
export const POST = adminRoute({ auth: "required", schema: changeEmailSchema }, async ({ auth, body, ip, ipHash, userAgent, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await prepareEmailChange(auth, { ...body, ip, baseUrl }, { ipHash, userAgent });
  if (!result.ok) {
    if (result.code === "rate_limited") return rateLimited(result.retryAfter ?? 60);
    return apiError(400, result.code);
  }
  if (result.send) {
    const msg = result.send;
    after(async () => {
      await sendEmail(msg);
    });
  }
  return apiOk();
});
