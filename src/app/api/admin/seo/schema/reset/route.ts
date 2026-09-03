import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { resetOrganizationFacts } from "@/lib/admin/seo";
import { DEFAULT_ORGANIZATION_FACTS } from "@/lib/seo/organization";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "seo:write" }, async ({ auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await resetOrganizationFacts({ user: auth.user, ipHash });
  return apiOk({ facts: DEFAULT_ORGANIZATION_FACTS });
});
