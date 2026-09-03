import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { redirects } from "@/db/schema";
import { repoQuery } from "@/lib/repo/util";
import { buildRedirectMap, REDIRECTS_TAG, type RedirectMap } from "@/lib/seo/redirect-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The redirect map the proxy keeps in memory (brief §3.6). The proxy calls
// this once per instance and then at most once per REDIRECT_TTL_MS in the
// background, so a public request never waits on it and never reaches the
// database: the map itself comes through the repo cache (60 s, busted by
// tag on every save), and hit counts arrive in the same call as a batch.
//
// GET  returns the map. It lists only enabled rules, which are observable
//      from the outside anyway. When the database cannot be read it answers
//      503 so the proxy keeps the last map it had instead of an empty one.
// POST returns the map and applies batched hit counts; it needs the cron
//      secret so nobody can inflate a counter.

const hitsSchema = z.object({ hits: z.record(z.string().max(300), z.number().int().min(1).max(1_000_000)).optional() });

async function loadMap(): Promise<RedirectMap | null> {
  return repoQuery<RedirectMap | null>({
    keys: ["repo", "seo", "redirect-map"],
    tags: [REDIRECTS_TAG],
    revalidate: 60,
    query: async () => {
      const rows = await getDb().select({ source: redirects.source, destination: redirects.destination, code: redirects.code }).from(redirects).where(eq(redirects.enabled, true));
      return buildRedirectMap(rows, new Date().toISOString());
    },
    fallback: () => null,
  });
}

function respond(map: RedirectMap | null) {
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };
  if (!map) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers });
  return NextResponse.json(map, { headers });
}

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return header.byteLength === expected.byteLength && timingSafeEqual(header, expected);
}

export async function GET() {
  return respond(await loadMap());
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const parsed = hitsSchema.safeParse(await req.json().catch(() => ({})));
  if (parsed.success && parsed.data.hits) {
    try {
      const db = getDb();
      const entries = Object.entries(parsed.data.hits).slice(0, 500);
      for (const [source, n] of entries) {
        await db.update(redirects).set({ hits: sql`${redirects.hits} + ${n}`, lastHitAt: sql`now()` }).where(eq(redirects.source, source));
      }
    } catch (err) {
      // The proxy re-queues the batch when the response is not ok.
      console.error("[redirects] hit flush failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  return respond(await loadMap());
}
