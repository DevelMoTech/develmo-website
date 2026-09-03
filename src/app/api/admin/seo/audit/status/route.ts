import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { loadAudit } from "@/lib/admin/seo";

export const runtime = "nodejs";

// Polled by the audit page while a run is in progress: ?id=<uuid>.
export const GET = adminRoute({ auth: "required", permission: "seo:read" }, async ({ auth, req }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(400, "bad_id");
  const run = await loadAudit(id);
  if (!run) return apiError(404, "not_found");
  return apiOk({ run });
});
