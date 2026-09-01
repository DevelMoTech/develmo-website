import { unstable_cache } from "next/cache";

// Shared machinery for the repository layer (brief §5.1). Every repo function:
//   1. reads from the database through unstable_cache, tagged per entity;
//   2. on any error or timeout returns the typed fallback from src/lib;
//   3. never throws to the caller.
// The public site keeps rendering, byte-identical, with the database down.

const QUERY_TIMEOUT_MS = 3500;
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
  revalidate?: number;
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
    console.error(`[repo] falling back to src/lib data for ${opts.keys.join(":")}:`, err);
    return opts.fallback();
  }
}
