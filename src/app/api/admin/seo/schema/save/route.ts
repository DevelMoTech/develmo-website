import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveOrganizationFacts } from "@/lib/admin/seo";
import { organizationFactsSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// Organization facts behind the JSON-LD in the site chrome (brief §3.6).
// The emitted shape is validated before anything is written.
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: organizationFactsSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveOrganizationFacts(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "invalid_schema", { errors: result.errors, warnings: result.warnings });
  return apiOk({ warnings: result.warnings });
});
