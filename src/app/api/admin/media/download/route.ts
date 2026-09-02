import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { mediaIdSchema } from "@/lib/schemas/media";
import { signedDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";

// A signed link to the stored original, valid for one minute.
export const GET = adminRoute({ auth: "required", permission: "media:read" }, async ({ req }) => {
  const parsed = mediaIdSchema.safeParse({ id: new URL(req.url).searchParams.get("id") });
  if (!parsed.success) return apiError(400, "invalid");
  const row = (await getDb().select({ blobKey: media.blobKey }).from(media).where(eq(media.id, parsed.data.id)).limit(1))[0];
  if (!row) return apiError(404, "not_found");
  const url = await signedDownloadUrl(row.blobKey, 60);
  return apiOk({ url, expiresIn: 60 });
});
