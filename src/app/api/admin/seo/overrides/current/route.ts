import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { fetchCurrentMeta } from "@/lib/admin/seo";
import { pathSchema } from "@/lib/schemas/seo";

export const runtime = "nodejs";

// What the public route serves right now (title, description, canonical,
// robots, H1s), for the editor's current values and the SERP preview.
export const POST = adminRoute({ auth: "required", permission: "seo:read", schema: pathSchema }, async ({ auth, body, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  try {
    const current = await fetchCurrentMeta(baseUrl, body.path);
    return apiOk({ current });
  } catch (err) {
    return apiError(502, "fetch_failed", { detail: err instanceof Error ? err.message : String(err) });
  }
});
