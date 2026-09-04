import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { runLeakCheck } from "@/lib/admin/translations";
import { leakRunSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";
export const maxDuration = 120;

// The locale leak check as a button (brief §3.9), replacing the manual
// HANDOFF §10 step 3. Head and every script block are stripped before the
// text is examined, because React serialises English key props into the RSC
// flight payload and a naive check false-positives on every page.
export const POST = adminRoute({ auth: "required", permission: "content:read", schema: leakRunSchema }, async ({ auth, body, baseUrl }) => {
  if (!auth) return apiError(401, "unauthenticated");
  return apiOk({ results: await runLeakCheck(baseUrl, body) });
});
