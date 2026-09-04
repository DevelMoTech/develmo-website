import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { recordPsiRun } from "@/lib/admin/performance";
import { psiRunSchema } from "@/lib/schemas/performance";

export const runtime = "nodejs";
// PSI runs Lighthouse against the URL, which is not quick.
export const maxDuration = 120;

// An on-demand PageSpeed Insights run, stored as a snapshot so runs are
// comparable over time (brief §3.8).
export const POST = adminRoute({ auth: "required", permission: "performance:write", schema: psiRunSchema }, async ({ auth, body, ipHash, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await recordPsiRun(baseUrl, body, { user: auth.user, ipHash });
  if (!result.ok) return apiError(502, "psi_failed", { detail: result.error });
  return apiOk({ id: result.id });
});
