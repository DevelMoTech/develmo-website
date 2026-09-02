import { z } from "zod";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { slugAvailable } from "@/lib/admin/posts";
import { POST_TYPES, slugSchema } from "@/lib/schemas/post";
import { nextSlug } from "@/lib/slug";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(POST_TYPES),
  slug: slugSchema,
  exclude: z.string().uuid().optional(),
});

// Live uniqueness check for the slug field, with a free suggestion when the
// requested slug is taken.
export const GET = adminRoute({ auth: "required", permission: "content:read" }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ type: sp.get("type"), slug: sp.get("slug"), exclude: sp.get("exclude") || undefined });
  if (!parsed.success) return apiError(400, "invalid", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  const { type, slug, exclude } = parsed.data;
  const available = await slugAvailable(type, slug, exclude);
  let suggestion = slug;
  for (let i = 0; !available && i < 20; i++) {
    suggestion = nextSlug(suggestion);
    if (await slugAvailable(type, suggestion, exclude)) break;
  }
  return apiOk({ available, suggestion });
});
