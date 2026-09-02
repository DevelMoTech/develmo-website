import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { jobSlugAvailable } from "@/lib/admin/jobs";
import { slugSchema } from "@/lib/schemas/post";
import { nextSlug } from "@/lib/slug";

export const runtime = "nodejs";

const querySchema = z.object({ slug: slugSchema, exclude: z.string().uuid().optional() });

export const GET = adminRoute({ auth: "required", permission: "content:read" }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ slug: sp.get("slug"), exclude: sp.get("exclude") || undefined });
  if (!parsed.success) return apiError(400, "invalid", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  const { slug, exclude } = parsed.data;
  const available = await jobSlugAvailable(slug, exclude);
  let suggestion = slug;
  for (let i = 0; !available && i < 20; i++) {
    suggestion = nextSlug(suggestion);
    if (await jobSlugAvailable(suggestion, exclude)) break;
  }
  return apiOk({ available, suggestion });
});
