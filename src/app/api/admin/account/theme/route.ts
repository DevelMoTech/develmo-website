import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { THEMES, THEME_COOKIE } from "@/app/(admin)/_lib/theme";

export const runtime = "nodejs";

const schema = z.object({ theme: z.enum(THEMES.map((t) => t.id) as [string, ...string[]]) });

// Persists the theme per user and mirrors it to a cookie for the no-flash
// server render. Not audited: a personal display preference, not site state.
export const POST = adminRoute({ auth: "required", schema }, async ({ auth, body }) => {
  if (!auth) return apiError(401, "unauthenticated");
  await getDb().update(users).set({ themePref: body.theme, updatedAt: new Date() }).where(eq(users.id, auth.user.id));
  const res = apiOk({ theme: body.theme });
  res.cookies.set(THEME_COOKIE, body.theme, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
});
