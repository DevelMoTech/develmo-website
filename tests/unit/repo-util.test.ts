import { beforeEach, describe, expect, it, vi } from "vitest";

// unstable_cache needs a Next server runtime; in unit tests it becomes an
// identity wrapper so repoQuery's own behaviour is what gets exercised.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

async function freshRepoUtil() {
  // The circuit breaker is module state; re-import per test for isolation.
  vi.resetModules();
  return await import("@/lib/repo/util");
}

describe("repoQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the query result when the database answers", async () => {
    const { repoQuery } = await freshRepoUtil();
    const result = await repoQuery({
      keys: ["t", "ok"],
      tags: ["t"],
      query: async () => ["db"],
      fallback: () => ["file"],
    });
    expect(result).toEqual(["db"]);
  });

  it("returns the fallback when the query throws", async () => {
    const { repoQuery } = await freshRepoUtil();
    const result = await repoQuery({
      keys: ["t", "fail"],
      tags: ["t"],
      query: async () => {
        throw new Error("connection refused");
      },
      fallback: () => ["file"],
    });
    expect(result).toEqual(["file"]);
  });

  it("returns the fallback when the query hangs past the timeout", async () => {
    vi.useFakeTimers();
    try {
      const { repoQuery, QUERY_TIMEOUT_MS } = await freshRepoUtil();
      const pending = repoQuery({
        keys: ["t", "hang"],
        tags: ["t"],
        query: () => new Promise<string[]>(() => {}),
        fallback: () => ["file"],
      });
      // Past whatever bound the module chose for this environment, so the
      // test keeps meaning the same thing in development and in production.
      await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS + 500);
      expect(await pending).toEqual(["file"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the production timeout tight and the development one generous", async () => {
    // In development setTimeout also measures the time Turbopack spends
    // compiling on the same event loop, which is seconds for a cold route, so
    // a production-tight bound made the first render of every route fall back
    // to file data. Production must not inherit the generous bound: there the
    // number is the point, it is how long a visitor waits on a sick database.
    const { queryTimeoutMs } = await freshRepoUtil();
    expect(queryTimeoutMs("production")).toBe(3500);
    expect(queryTimeoutMs("development")).toBeGreaterThanOrEqual(30_000);
    expect(queryTimeoutMs("test")).toBeGreaterThanOrEqual(30_000);
  });

  it("opens the circuit breaker after repeated failures and skips the query", async () => {
    const { repoQuery } = await freshRepoUtil();
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    for (let i = 0; i < 3; i++) {
      await repoQuery({ keys: ["t", "b"], tags: ["t"], query: failing, fallback: () => "file" });
    }
    expect(failing).toHaveBeenCalledTimes(3);
    // Breaker is now open: the next call must not touch the database.
    const result = await repoQuery({
      keys: ["t", "b"],
      tags: ["t"],
      query: failing,
      fallback: () => "file",
    });
    expect(result).toBe("file");
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("never throws to the caller even if the fallback data is used", async () => {
    const { repoQuery } = await freshRepoUtil();
    await expect(
      repoQuery({
        keys: ["t", "never-throw"],
        tags: ["t"],
        query: async () => {
          throw new Error("boom");
        },
        fallback: () => 42,
      }),
    ).resolves.toBe(42);
  });
});
