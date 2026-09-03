import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { checkRedirect } from "@/lib/admin/seo";
import { redirectSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// Loop, chain and conflict detection for a rule as it is typed.
export const POST = adminRoute({ auth: "required", permission: "seo:read", schema: redirectSchema }, async ({ auth, body }) => {
  if (!auth) return apiError(401, "unauthenticated");
  return apiOk({ check: await checkRedirect(body) });
});
