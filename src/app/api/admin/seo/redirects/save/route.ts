import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveRedirect } from "@/lib/admin/seo";
import { redirectSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// Create or update a redirect (brief §3.6). Rejected outright on a loop or a
// conflict; the proxy picks up the change within its TTL.
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: redirectSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveRedirect(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(result.error === "not_found" ? 404 : 400, result.error, { check: result.check });
  return apiOk({ id: result.id, check: result.check });
});
