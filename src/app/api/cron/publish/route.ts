import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { closeDueJobs } from "@/lib/admin/jobs";
import { publishDuePosts } from "@/lib/admin/posts";
import { purgeExpired, retryPendingDeliveries } from "@/lib/admin/submissions";
import { sendDailyDigests } from "@/lib/submissions/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled publishing without a deploy (brief §3.3), and closing job
// postings whose closing time has passed (§3.4). Vercel Cron calls this
// with "Authorization: Bearer <CRON_SECRET>". With the secret unset the
// route refuses with 503 so a misconfiguration is visible, not silent. The
// repo layer already shows due scheduled posts; this flips the stored
// status, writes the revision and audit rows, and busts the cache.
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return header.byteLength === expected.byteLength && timingSafeEqual(header, expected);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const { published } = await publishDuePosts();
  const { closed } = await closeDueJobs();
  // Inbox housekeeping (brief §3.5): deliveries that never completed, daily
  // digests, then the retention purge.
  const retried = await retryPendingDeliveries();
  const digests = await sendDailyDigests();
  const purged = await purgeExpired();
  return NextResponse.json({ ok: true, published, closedJobs: closed, retried, digests, purged, at: new Date().toISOString() });
}
