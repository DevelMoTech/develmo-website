import { after } from "next/server";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { runSeoAudit, startAudit } from "@/lib/admin/seo";

export const runtime = "nodejs";
// The crawl runs after the response, inside this function's lifetime.
export const maxDuration = 300;

// On-demand SEO audit (brief §3.6): the run row is created now, the crawl
// itself happens after the response and the page polls for the result.
export const POST = adminRoute({ auth: "required", permission: "seo:write" }, async ({ auth, ipHash, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const started = await startAudit(baseUrl, { user: auth.user, ipHash });
  if ("error" in started) return apiError(409, started.error);
  after(async () => {
    await runSeoAudit(started.id, started.origin);
  });
  return apiOk({ id: started.id });
});
