import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { setRating } from "@/lib/admin/applications";
import { applicationRatingSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: applicationRatingSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const ok = await setRating(body.id, body.rating, { user: auth.user, ipHash });
  if (!ok) return apiError(404, "not_found");
  return apiOk();
});
