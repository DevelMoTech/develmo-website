import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { setFaqEnabled } from "@/lib/admin/seo";

export const runtime = "nodejs";

const schema = z.object({ path: z.string().trim().regex(/^\/(what-we-do|who-we-help|our-products)\/[a-z0-9-]+$/, "Not a detail page with FAQs"), enabled: z.boolean() });

// FAQPage JSON-LD per detail page (brief §3.6).
export const POST = adminRoute({ auth: "required", permission: "seo:write", schema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await setFaqEnabled(body.path, body.enabled, { user: auth.user, ipHash });
  return apiOk();
});
