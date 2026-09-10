// A development-only shim for one Next.js log line.
//
// unstable_cache serves a stale entry and refreshes it in the background. When
// that refresh throws, Next keeps serving the stale entry and logs
// "revalidating cache with key: ... <error>" with console.error (its own
// source marks the spot "@TODO This error handling seems wrong"). The dev
// overlay forwards a server console.error into the browser as a broken page,
// which it is not: the visitor got the last good data. The repository layer
// avoids the rejection whenever this process has fetched the key before
// (src/lib/repo/util.ts), but an entry prerendered at build time or written
// by an earlier process has no such memory, and that is exactly the case
// after a restart with the database down.
//
// So in development that one line becomes a warning, still in the server log
// with the same detail, and the overlay leaves it alone. In production the
// severity is left as Next set it: an unrefreshable cache during a database
// outage is an error worth alerting on.

const STALE_REFRESH = /^revalidating cache with key: /;

export function isNextStaleRefreshLog(args: readonly unknown[]): boolean {
  return typeof args[0] === "string" && STALE_REFRESH.test(args[0]);
}

export function describeStaleRefresh(args: readonly unknown[]): string {
  const err = args.find((a): a is Error => a instanceof Error);
  const detail = err ? err.message : String(args[1] ?? "");
  return `[next] a stale cache entry could not be refreshed and the last good value is still being served: ${detail}`;
}

type Shimmed = typeof globalThis & { __develmoConsoleShim?: boolean };

// Idempotent: instrumentation can run more than once in development.
export function installDevConsoleShim(env: string | undefined = process.env.NODE_ENV): boolean {
  if (env === "production") return false;
  const g = globalThis as Shimmed;
  if (g.__develmoConsoleShim) return false;
  g.__develmoConsoleShim = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isNextStaleRefreshLog(args)) {
      console.warn(describeStaleRefresh(args));
      return;
    }
    original(...args);
  };
  return true;
}
