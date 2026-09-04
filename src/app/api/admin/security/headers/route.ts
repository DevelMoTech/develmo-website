import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { checkHeaders, SECURITY_PERMISSION } from "@/lib/admin/security";
import { headersCheckSchema } from "@/lib/schemas/security";

export const runtime = "nodejs";

// Read only (brief §3.7). Fetches a live public URL on this deployment and
// grades the headers it came back with. It never sets, changes or proposes a
// header; the policy lives in next.config.ts and is deployed with the code.
export const POST = adminRoute({ auth: "required", permission: SECURITY_PERMISSION, schema: headersCheckSchema }, async ({ auth, body, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await checkHeaders(baseUrl, body.path);
  if (!result.ok) return apiError(502, "fetch_failed", { detail: result.error });
  return apiOk({ report: result.report, headers: result.headers });
});
