import { unstable_cache } from "next/cache";

// Shared machinery for the repository layer (brief §5.1). Every repo function:
//   1. reads from the database through unstable_cache, tagged per entity;
//   2. on any error or timeout returns the typed fallback from src/lib;
//   3. never throws to the caller.
// The public site keeps rendering, byte-identical, with the database down.

// setTimeout measures wall clock, and in development that includes the time
// Turbopack spends compiling on the same event loop. A cold route takes 3 to
// 33 seconds to compile here while the database itself answers in under 20ms,
// so a production-tight bound made the first render of every route fall back
// to the file data, trip the breaker, and then keep serving file data for the
// cooldown: an edit made in the console looked like it had not saved.
export function queryTimeoutMs(env: string | undefined = process.env.NODE_ENV): number {
  return env === "production" ? 3500 : 30_000;
}

export const QUERY_TIMEOUT_MS = queryTimeoutMs();
const DEFAULT_REVALIDATE_S = 300;

// Per-instance circuit breaker: after repeated failures, skip the database for
// a cooldown instead of paying the connection timeout on every render.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
let breakerFailures = 0;
let breakerOpenUntil = 0;

function breakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

function breakerFail(): void {
  breakerFailures += 1;
  if (breakerFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    breakerFailures = 0;
  }
}

function breakerOk(): void {
  breakerFailures = 0;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`repo query timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function repoQuery<T>(opts: {
  // Stable cache key for this query, e.g. ["repo", "posts", "list"].
  keys: string[];
  // Cache tags for on-demand revalidation, e.g. ["posts"].
  tags: string[];
  // Seconds, or false for tag-only invalidation (no time-based expiry).
  revalidate?: number | false;
  query: () => Promise<T>;
  fallback: () => T;
}): Promise<T> {
  if (breakerOpen()) return opts.fallback();
  try {
    const cached = unstable_cache(opts.query, opts.keys, {
      tags: opts.tags,
      revalidate: opts.revalidate ?? DEFAULT_REVALIDATE_S,
    });
    const result = await withTimeout(cached(), QUERY_TIMEOUT_MS);
    breakerOk();
    return result;
  } catch (err) {
    breakerFail();
    // A warning, not an error, and a string rather than the Error: the
    // fallback is the designed behaviour and the page that renders is correct.
    // Next forwards a server-side console.error into the browser in
    // development, where it reads as a broken page.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[repo] ${opts.keys.join(":")} fell back to the typed file data: ${reason}`);
    return opts.fallback();
  }
}
