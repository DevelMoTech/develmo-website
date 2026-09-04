import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { saveNavigation } from "@/lib/admin/content";
import { navigationSchema } from "@/lib/schemas/content";

export const runtime = "nodejs";

// The mega menu's top bar and company panel (brief §3.9). A menu containing a
// link to a route that does not resolve is refused, with the offending links
// named, rather than saved and discovered by a visitor.
export const POST = adminRoute({ auth: "required", permission: "content:write", schema: navigationSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const result = await saveNavigation(body, { user: auth.user, ipHash });
  if (result.ok) return apiOk();
  if (result.error === "dead_links") return apiError(400, "dead_links", { dead: result.dead });
  return apiError(400, "invalid", { issues: result.issues });
});
