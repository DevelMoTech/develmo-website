import { adminRoute, apiOk } from "@/lib/auth/api";
import { markdownToHtml } from "@/lib/markdown";
import { markdownRenderSchema } from "@/lib/schemas/post";
import { readingTimeMinutes } from "@/lib/slug";

export const runtime = "nodejs";

// Live preview for the editor: the same remark + rehype-sanitize pipeline
// the public page uses, returned as sanitized HTML.
export const POST = adminRoute({ auth: "required", permission: "content:read", schema: markdownRenderSchema }, async ({ body }) => {
  const html = await markdownToHtml(body.markdown);
  return apiOk({ html, readingTime: readingTimeMinutes(body.markdown) });
});
