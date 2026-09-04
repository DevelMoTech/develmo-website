import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveMediaSettings } from "@/lib/admin/performance";
import { mediaSettingsSchema } from "@/lib/schemas/performance";

export const runtime = "nodejs";

// Hero video autoplay on mobile and the poster-only breakpoint, read by
// HeroStage (brief §3.8). prefers-reduced-motion wins over both.
export const POST = adminRoute({ auth: "required", permission: "performance:write", schema: mediaSettingsSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await saveMediaSettings(body, { user: auth.user, ipHash });
  return apiOk();
});
