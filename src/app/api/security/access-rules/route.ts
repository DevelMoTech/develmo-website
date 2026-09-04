import { timingSafeEqual } from "node:crypto";
import { gte, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { ipRules } from "@/db/schema";
import { repoQuery } from "@/lib/repo/util";
import { ACCESS_TAG, type AccessRuleSet } from "@/lib/security/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The IP access rule set the proxy keeps in memory (brief §3.7). The proxy
// calls this once per instance and then at most once per ACCESS_TTL_MS in
// the background, so a public request never waits on it and never reaches
// the database: the rules come through the repo cache (30 s, busted by tag
// on every save).
//
// Unlike the redirect map this list is NOT public. A blocklist tells an
// attacker which of their addresses are known, so the endpoint requires the
// cron secret and the proxy always sends it. Without CRON_SECRET the route
// refuses and the proxy enforces nothing: an unreadable list fails open,
// because a marketing site that cannot reach its database must still serve
// visitors. That trade is deliberate and stated in the console.

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return header.byteLength === expected.byteLength && timingSafeEqual(header, expected);
}

async function loadRules(): Promise<AccessRuleSet | null> {
  return repoQuery<AccessRuleSet | null>({
    keys: ["repo", "security", "ip-rules"],
    tags: [ACCESS_TAG],
    revalidate: 30,
    query: async () => {
      const now = new Date();
      const rows = await getDb()
        .select({ id: ipRules.id, cidr: ipRules.cidr, action: ipRules.action, reason: ipRules.reason, expiresAt: ipRules.expiresAt })
        .from(ipRules)
        .where(or(isNull(ipRules.expiresAt), gte(ipRules.expiresAt, now)));
      return {
        rules: rows.map((r) => ({ id: r.id, cidr: r.cidr, action: r.action, reason: r.reason, expiresAt: r.expiresAt?.toISOString() ?? null })),
        generatedAt: new Date().toISOString(),
      };
    },
    fallback: () => null,
  });
}

export async function GET(req: Request) {
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401, headers });
  const set = await loadRules();
  if (!set) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers });
  return NextResponse.json(set, { headers });
}
