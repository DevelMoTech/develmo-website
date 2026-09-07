import { sql } from "drizzle-orm";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getDb } from "@/db";
import { rateLimitConfig, rateLimitHits } from "@/db/schema";
import { hashIp } from "@/lib/auth/ip";

// Durable rate limiting (brief §2, §7.4). Upstash sliding windows when
// UPSTASH_REDIS_REST_URL/TOKEN are set, otherwise fixed windows in Postgres so
// limits still hold across serverless instances in dev and e2e. If the
// database itself is unreachable the limiter degrades to a per-instance memory
// window rather than blocking the public forms.
//
// Limits are editable at runtime through the rate_limit_config table (security
// manager); the defaults below apply until a row exists.

export type LimiterKey =
  | "login"
  | "login_account"
  | "signup"
  | "reset"
  | "reset_account"
  | "mfa"
  | "email_change"
  | "contact"
  | "apply"
  | "access_request"
  | "upload"
  | "vitals";

export type Limit = { max: number; windowSeconds: number };

export const DEFAULT_LIMITS: Record<LimiterKey, Limit> = {
  // 5 failed logins per IP in 10 minutes (brief §3.1 acceptance).
  login: { max: 5, windowSeconds: 600 },
  login_account: { max: 10, windowSeconds: 900 },
  signup: { max: 10, windowSeconds: 600 },
  reset: { max: 5, windowSeconds: 900 },
  reset_account: { max: 3, windowSeconds: 900 },
  mfa: { max: 5, windowSeconds: 600 },
  email_change: { max: 3, windowSeconds: 900 },
  // The contact form keeps its existing 5 per minute per IP.
  contact: { max: 5, windowSeconds: 60 },
  apply: { max: 5, windowSeconds: 600 },
  // Asking for console access is a rare, deliberate act; three an hour per
  // address is plenty for a person and useless for a script.
  access_request: { max: 3, windowSeconds: 3600 },
  upload: { max: 30, windowSeconds: 600 },
  // Real user metrics: a generous per-address cap, since one visit sends
  // at most two batches and a busy office shares one address.
  vitals: { max: 120, windowSeconds: 600 },
};

export type LimitResult = { limited: boolean; remaining: number; resetAt: Date };

// --- runtime config -----------------------------------------------------------

const CONFIG_TTL_MS = 30_000;
let configCache: { at: number; rows: Map<string, Limit> } | null = null;

export async function getLimit(key: LimiterKey): Promise<Limit> {
  const now = Date.now();
  if (!configCache || now - configCache.at > CONFIG_TTL_MS) {
    try {
      const rows = await getDb().select().from(rateLimitConfig);
      configCache = {
        at: now,
        rows: new Map(rows.map((r) => [r.key, { max: r.maxRequests, windowSeconds: r.windowSeconds }])),
      };
    } catch {
      configCache = { at: now, rows: configCache?.rows ?? new Map() };
    }
  }
  return configCache.rows.get(key) ?? DEFAULT_LIMITS[key];
}

// --- backends -----------------------------------------------------------------

function hashIdentity(identity: string): string {
  return hashIp(identity.toLowerCase());
}

const upstashInstances = new Map<string, Ratelimit>();

function upstash(key: LimiterKey, limit: Limit): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const id = `${key}:${limit.max}:${limit.windowSeconds}`;
  let inst = upstashInstances.get(id);
  if (!inst) {
    inst = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit.max, `${limit.windowSeconds} s`),
      prefix: `dm:rl:${key}`,
    });
    upstashInstances.set(id, inst);
  }
  return inst;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryHit(rowKey: string, expiresAt: number, consume: boolean): number {
  const cur = memory.get(rowKey);
  if (!cur || cur.expiresAt < Date.now()) {
    if (consume) memory.set(rowKey, { count: 1, expiresAt });
    return consume ? 1 : 0;
  }
  if (consume) cur.count += 1;
  return cur.count;
}

async function windowHit(key: LimiterKey, identity: string, limit: Limit, consume: boolean): Promise<LimitResult> {
  const windowMs = limit.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const rowKey = `${key}:${hashIdentity(identity)}:${windowStart}`;
  let count: number;
  try {
    const db = getDb();
    if (consume) {
      const [row] = await db
        .insert(rateLimitHits)
        .values({ key: rowKey, count: 1, expiresAt })
        .onConflictDoUpdate({ target: rateLimitHits.key, set: { count: sql`${rateLimitHits.count} + 1` } })
        .returning({ count: rateLimitHits.count });
      count = row.count;
      // Opportunistic cleanup of expired windows.
      if (Math.random() < 0.02) {
        await db.delete(rateLimitHits).where(sql`${rateLimitHits.expiresAt} < now()`);
      }
    } else {
      const rows = await db
        .select({ count: rateLimitHits.count })
        .from(rateLimitHits)
        .where(sql`${rateLimitHits.key} = ${rowKey}`)
        .limit(1);
      count = rows[0]?.count ?? 0;
    }
  } catch (err) {
    console.error("[ratelimit] database unavailable, using per-instance window:", err);
    count = memoryHit(rowKey, expiresAt.getTime(), consume);
  }
  // A consumed hit is over the limit once it exceeds max; a peek is "limited"
  // as soon as no budget remains, matching Upstash's limit()/getRemaining().
  const limited = consume ? count > limit.max : count >= limit.max;
  return { limited, remaining: Math.max(0, limit.max - count), resetAt: expiresAt };
}

// --- public API ---------------------------------------------------------------

// Reports whether `identity` is already over the limit, without counting a hit.
export async function peekLimit(key: LimiterKey, identity: string): Promise<LimitResult> {
  const limit = await getLimit(key);
  const up = upstash(key, limit);
  if (up) {
    const r = await up.getRemaining(hashIdentity(identity));
    return { limited: r.remaining <= 0, remaining: r.remaining, resetAt: new Date(r.reset) };
  }
  return windowHit(key, identity, limit, false);
}

// Counts a hit and reports whether the limit is now exceeded.
export async function consumeLimit(key: LimiterKey, identity: string): Promise<LimitResult> {
  const limit = await getLimit(key);
  const up = upstash(key, limit);
  if (up) {
    const r = await up.limit(hashIdentity(identity));
    return { limited: !r.success, remaining: r.remaining, resetAt: new Date(r.reset) };
  }
  return windowHit(key, identity, limit, true);
}

export function retryAfterSeconds(r: LimitResult): number {
  return Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
}
