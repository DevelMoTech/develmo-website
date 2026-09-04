import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveTech } from "@/lib/admin/content";
import { techSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";

// The company facts in src/lib/site.ts, editable at runtime (brief §3.9).
const schema = z.object({ value: techSchema });

export const POST = adminRoute({ auth: "required", permission: "content:write", schema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveTech(body.value, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "invalid", { issues: result.issues });
  return apiOk();
});
