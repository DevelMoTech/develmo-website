import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveEntry } from "@/lib/admin/content";
import { saveEntrySchema } from "@/lib/schemas/content";

export const runtime = "nodejs";

// One content entry (brief §3.9). The payload is validated against the schema
// that mirrors the typed file, so the optional shapes survive and the detail
// pages keep emitting their FAQPage JSON-LD.
export const POST = adminRoute({ auth: "required", permission: "content:write", schema: saveEntrySchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveEntry(body.entity, body.key, body.data, { user: auth.user, ipHash });
  if (!result.ok) return apiError(400, "invalid", { issues: result.issues });
  return apiOk();
});
