import { CONTENT_TYPES, typeFromExtension } from "@/lib/images";
import { getObject, KEY_RE, verifyLocalSignature } from "@/lib/storage";

// Serves library images from our own origin (brief §3.10) so the public CSP
// img-src stays 'self' and a replaced file keeps its URL. Keys are
// unguessable 128-bit hex names with the sniffed extension; the content type
// comes from that extension, never from the request. Short CDN TTL because a
// replace must show up within minutes; browsers revalidate after an hour.

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!KEY_RE.test(key)) return new Response("Not found", { status: 404 });
  const type = typeFromExtension(key.split(".").pop() ?? "");
  if (!type) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  if (download) {
    // Only a signed, unexpired link may force a download of the original.
    const exp = url.searchParams.get("exp") ?? "";
    const sig = url.searchParams.get("sig") ?? "";
    if (!verifyLocalSignature(key, exp, sig)) return new Response("Not found", { status: 404 });
  }

  const obj = await getObject(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": CONTENT_TYPES[type],
    "x-content-type-options": "nosniff",
    "cache-control": download ? "private, no-store" : "public, max-age=3600, s-maxage=300, stale-while-revalidate=86400",
  });
  if (obj.size !== null) headers.set("content-length", String(obj.size));
  if (download) headers.set("content-disposition", `attachment; filename="${key}"`);
  return new Response(obj.body as BodyInit, { status: 200, headers });
}
