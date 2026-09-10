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

// The last value the database gave for each key, per process.
//
// unstable_cache serves a stale entry and refreshes it in the background. When
// that refresh rejects, Next logs the rejection with console.error, keeps the
// stale entry, and the development overlay presents the log as a broken page
// ("Failed query: select ... from settings"). The page was never broken. So
// the cached callback does not reject once this process has fetched the key:
// it hands back the last value the database gave, which is truer than the
// file fallback and quieter than the log, and Next re-caches it and tries
// again when it expires. A key that has never succeeded still throws, so
// nothing stale or made up is ever cached in the database's name.
//
// The memory is per process, so it covers an outage that begins while the
// server is up. It cannot cover an entry another process wrote, such as a
// page prerendered at build time, or a persisted entry found by a server that
// started while the database was already down; that log line is handled in
// development by src/lib/dev-console.ts.
const lastGood = new Map<string, unknown>();

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

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const key = opts.keys.join(":");

  // While the breaker is open the database is not touched at all. The last
  // value it gave is still the best answer available.
  if (breakerOpen()) return lastGood.has(key) ? (lastGood.get(key) as T) : opts.fallback();

  // Set when the callback swallowed a failure, so the success path below does
  // not reset the breaker for a query that did not actually succeed.
  let servedLastGood = false;
  const guarded = async (): Promise<T> => {
    try {
      const value = await opts.query();
      lastGood.set(key, value);
      return value;
    } catch (err) {
      if (!lastGood.has(key)) throw err;
      servedLastGood = true;
      breakerFail();
      console.warn(`[repo] ${key} kept the last value the database gave: ${describe(err)}`);
      return lastGood.get(key) as T;
    }
  };

  try {
    const cached = unstable_cache(guarded, opts.keys, {
      tags: opts.tags,
      revalidate: opts.revalidate ?? DEFAULT_REVALIDATE_S,
    });
    const result = await withTimeout(cached(), QUERY_TIMEOUT_MS);
    if (!servedLastGood) breakerOk();
    return result;
  } catch (err) {
    breakerFail();
    // A warning, not an error, and a string rather than the Error: the
    // fallback is the designed behaviour and the page that renders is correct.
    // Next forwards a server-side console.error into the browser in
    // development, where it reads as a broken page.
    console.warn(`[repo] ${key} fell back to the typed file data: ${describe(err)}`);
    return opts.fallback();
  }
}
