import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { updateProfile } from "@/lib/auth/flows";
import { updateProfileSchema } from "@/lib/schemas/auth";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", schema: updateProfileSchema }, async ({ auth, body, ipHash, userAgent }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await updateProfile(auth, body, { ipHash, userAgent });
  return apiOk();
});
