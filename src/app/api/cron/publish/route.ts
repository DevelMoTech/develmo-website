import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/admin/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled publishing without a deploy (brief §3.3). Vercel Cron calls this
// with "Authorization: Bearer <CRON_SECRET>". With the secret unset the
// route refuses with 503 so a misconfiguration is visible, not silent. The
// repo layer already shows due scheduled posts; this flips the stored
// status, writes the revision and audit rows, and busts the cache.
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const { published } = await publishDuePosts();
  return NextResponse.json({ ok: true, published, at: new Date().toISOString() });
}
