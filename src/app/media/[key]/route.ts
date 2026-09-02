import { CONTENT_TYPES, typeFromExtension } from "@/lib/images";
import { DOCUMENT_CONTENT_TYPES, documentTypeFromExtension } from "@/lib/documents";
import { getObject, isPrivateKey, KEY_RE, verifyLocalSignature } from "@/lib/storage";

// Serves library images from our own origin (brief §3.10) so the public CSP
// img-src stays 'self' and a replaced file keeps its URL. Keys are
// unguessable 128-bit hex names with the sniffed extension; the content type
// comes from that extension, never from the request. Short CDN TTL because a
// replace must show up within minutes; browsers revalidate after an hour.
// Private objects (CVs) are only released with a valid signed download link.

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!KEY_RE.test(key)) return NOT_FOUND();
  const ext = key.split(".").pop() ?? "";
  const imageType = typeFromExtension(ext);
  const docType = documentTypeFromExtension(ext);
  const contentType = imageType ? CONTENT_TYPES[imageType] : docType ? DOCUMENT_CONTENT_TYPES[docType] : null;
  if (!contentType) return NOT_FOUND();

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1" || isPrivateKey(key);
  if (download) {
    // Only a signed, unexpired link may force a download of the original.
    const exp = url.searchParams.get("exp") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    if (!verifyLocalSignature(key, exp, sig)) return NOT_FOUND();
  }

  const obj = await getObject(key);
  if (!obj) return NOT_FOUND();

  const headers = new Headers({
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "cache-control": download ? "private, no-store" : "public, max-age=3600, s-maxage=300, stale-while-revalidate=86400",
  });
  if (obj.size !== null) headers.set("content-length", String(obj.size));
  if (download) headers.set("content-disposition", `attachment; filename="${key}"`);
  return new Response(obj.body as BodyInit, { status: 200, headers });
}
