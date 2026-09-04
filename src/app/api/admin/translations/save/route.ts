import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveTranslation } from "@/lib/admin/translations";
import { translationSaveSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";

// Overrides are written to the database, never to extra.ts or data.ts, which
// stay the seed and the fallback (brief §3.9). An empty value clears the
// override so the file value applies again.
export const POST = adminRoute({ auth: "required", permission: "content:write", schema: translationSaveSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveTranslation(body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, result.error);
  return apiOk({ cleared: result.cleared });
});
