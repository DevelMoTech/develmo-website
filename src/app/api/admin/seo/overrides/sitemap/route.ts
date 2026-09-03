import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveSitemapFields } from "@/lib/admin/seo";
import { sitemapFieldsSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// The sitemap columns of a route's override only; the metadata fields on
// the same row are left as they are.
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema: sitemapFieldsSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveSitemapFields(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, result.error);
  return apiOk();
});
