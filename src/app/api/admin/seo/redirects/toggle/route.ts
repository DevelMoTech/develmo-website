import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { setRedirectEnabled } from "@/lib/admin/seo";

export const runtime = "nodejs";

const schema = z.object({ id: z.string().uuid(), enabled: z.boolean() });

export const POST = adminRoute({ auth: "required", permission: "seo:write", schema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const ok = await setRedirectEnabled(body.id, body.enabled, { user: auth.user, ipHash });
  if (!ok) return apiError(404, "not_found");
  return apiOk();
});
