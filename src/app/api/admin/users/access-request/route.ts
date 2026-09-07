import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { decideAccessRequest } from "@/lib/auth/access-requests";
import { accessDecisionSchema } from "@/lib/schemas/access";

export const runtime = "nodejs";

// Deciding an access request is the same authority as inviting someone,
// because approving one does exactly that.
export const POST = adminRoute({ auth: "required", permission: "users:manage", schema: accessDecisionSchema }, async ({ auth, body, ipHash, userAgent, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await decideAccessRequest(auth.user, body, { ipHash, userAgent, baseUrl });
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "forbidden" ? 403 : 409;
    return apiError(status, result.code);
  }
  if (result.decision === "decline") return apiOk({ decision: "decline" });
  return apiOk({ decision: "approve", emailed: result.emailed, url: result.url });
});
