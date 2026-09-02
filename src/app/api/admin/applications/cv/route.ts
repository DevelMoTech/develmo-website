import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { cvDownloadUrl } from "@/lib/admin/applications";
import { mediaIdSchema } from "@/lib/schemas/media";

export const runtime = "nodejs";

// A signed link to the CV, valid for one minute; each issue is audited so
// access to personal data is traceable (brief §3.4, §7).
export const GET = adminRoute({ auth: "required", permission: "submissions:read" }, async ({ req, auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const parsed = mediaIdSchema.safeParse({ id: new URL(req.url).searchParams.get("id") });
  if (!parsed.success) return apiError(400, "invalid");
  const link = await cvDownloadUrl(parsed.data.id);
  if (!link) return apiError(404, "not_found");
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "application.cv_download", entityType: "application", entityId: parsed.data.id, ipHash });
  return apiOk({ url: link.url, filename: link.filename, expiresIn: 60 });
});
