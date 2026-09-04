import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { webVitals } from "@/db/schema";
import { getClientIp } from "@/lib/auth/ip";
import { consumeLimit } from "@/lib/ratelimit";
import { deviceClassFrom, isPlausible, isMetric, MAX_SAMPLES_PER_BATCH, METRICS, normaliseRoute } from "@/lib/perf/vitals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real user metrics from the public site (brief §3.8). Same origin, so the
// existing CSP allows the beacon through connect-src 'self'; this route adds
// no header of its own and needs no policy change.
//
// The response is always 204 with an empty body: a reporting endpoint must
// never tell a caller anything, never cost the visitor a round trip's worth
// of parsing, and never fail the page. Bad input is dropped silently, the
// write happens after the response, and the rate limiter caps how much any
// one address can insert.

const schema = z.object({
  route: z.string().trim().max(300),
  samples: z
    .array(z.object({ metric: z.enum(METRICS), value: z.number() }))
    .min(1)
    .max(MAX_SAMPLES_PER_BATCH),
});

const NO_CONTENT = { status: 204, headers: { "cache-control": "no-store" } } as const;

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const limit = await consumeLimit("vitals", ip);
  if (limit.limited) return new Response(null, NO_CONTENT);

  // sendBeacon sends a Blob, so the content type is whatever the blob said.
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return new Response(null, NO_CONTENT);

  const route = normaliseRoute(parsed.data.route);
  const deviceClass = deviceClassFrom(req.headers.get("user-agent"));
  const rows = parsed.data.samples
    .filter((s) => isMetric(s.metric) && isPlausible(s.metric, s.value))
    .map((s) => ({ route, metric: s.metric, value: s.value, deviceClass }));

  if (rows.length > 0) {
    after(async () => {
      try {
        await getDb().insert(webVitals).values(rows);
      } catch (err) {
        console.error("[vitals] insert failed:", err instanceof Error ? err.message : err);
      }
    });
  }
  return new Response(null, NO_CONTENT);
}
