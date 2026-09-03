import { after } from "next/server";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { bustSitemap, warmSitemap } from "@/lib/admin/seo";

export const runtime = "nodejs";

// "Regenerate now": busts the cached sitemap, then rebuilds it right after
// this response. The rebuild has to wait for the response because cache
// invalidations issued by a route handler are applied when it finishes; a
// fetch inside the handler would still get the old file.
export const POST = adminRoute({ auth: "required", permission: "seo:write" }, async ({ auth, ipHash, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await bustSitemap({ user: auth.user, ipHash });
  after(async () => {
    await warmSitemap(baseUrl);
  });
  return apiOk({ regenerating: true });
});
