import { after } from "next/server";
import { adminRoute, apiOk, rateLimited } from "@/lib/auth/api";
import { preparePasswordReset } from "@/lib/auth/flows";
import { sendEmail } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

// Always answers the same way whether or not the address has an account. The
// email itself is sent after the response so timing does not differ either.
export const POST = adminRoute({ auth: "none", schema: forgotPasswordSchema }, async ({ body, ip, ipHash, userAgent, baseUrl }) => {
  const result = await preparePasswordReset({ email: body.email, ip, baseUrl }, { ipHash, userAgent });
  if (result.rateLimited) return rateLimited(result.retryAfter ?? 60);
  if (result.send) {
    const msg = result.send;
    after(async () => {
      await sendEmail(msg);
    });
  }
  return apiOk();
});
