import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { digestSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

// Per-user submission digest preference (brief §3.5). Not audited: a
// personal notification preference, not site state.
export const POST = adminRoute({ auth: "required", schema: digestSchema }, async ({ auth, body }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await getDb().update(users).set({ digest: body.digest, updatedAt: new Date() }).where(eq(users.id, auth.user.id));
  return apiOk({ digest: body.digest });
});
