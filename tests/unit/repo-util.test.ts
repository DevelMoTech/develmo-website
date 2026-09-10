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

// unstable_cache serves a stale entry and refreshes it in the background; a
// rejection there is logged by Next with console.error and shown by the dev
// overlay as a broken page. So once a key has succeeded, the cached callback
// hands back the last value the database gave instead of rejecting.
describe("repoQuery keeps the last value the database gave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("serves the last good value when a later query fails, without rejecting and without the file fallback", async () => {
    const { repoQuery } = await freshRepoUtil();
    let up = true;
    const query = async () => {
      if (!up) throw new Error("Failed query: select ... connection refused");
      return ["db"];
    };
    const opts = { keys: ["t", "lastgood"], tags: ["t"], query, fallback: () => ["file"] };
    expect(await repoQuery(opts)).toEqual(["db"]);
    up = false;
    expect(await repoQuery(opts), "the database's last answer, not the file").toEqual(["db"]);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("kept the last value the database gave"));
  });

  it("still throws through to the file fallback for a key that has never succeeded", async () => {
    const { repoQuery } = await freshRepoUtil();
    const result = await repoQuery({
      keys: ["t", "never"],
      tags: ["t"],
      query: async () => {
        throw new Error("connection refused");
      },
      fallback: () => ["file"],
    });
    expect(result).toEqual(["file"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("fell back to the typed file data"));
  });

  it("counts a swallowed failure against the breaker, and an open breaker serves the last good value", async () => {
    const { repoQuery } = await freshRepoUtil();
    let up = true;
    const query = vi.fn(async () => {
      if (!up) throw new Error("down");
      return "db";
    });
    const opts = { keys: ["t", "breaker-lastgood"], tags: ["t"], query, fallback: () => "file" };
    expect(await repoQuery(opts)).toBe("db");
    up = false;
    for (let i = 0; i < 3; i++) expect(await repoQuery(opts)).toBe("db");
    const calls = query.mock.calls.length;
    // Breaker is open: the database is not touched, and the answer is still
    // the last thing it said rather than the file.
    expect(await repoQuery(opts)).toBe("db");
    expect(query.mock.calls.length, "no query while the breaker is open").toBe(calls);
  });

  it("refreshes the last good value when the database answers again", async () => {
    const { repoQuery } = await freshRepoUtil();
    let answer: string | null = "first";
    const query = async () => {
      if (answer === null) throw new Error("down");
      return answer;
    };
    const opts = { keys: ["t", "refresh"], tags: ["t"], query, fallback: () => "file" };
    expect(await repoQuery(opts)).toBe("first");
    answer = null;
    expect(await repoQuery(opts)).toBe("first");
    answer = "second";
    expect(await repoQuery(opts)).toBe("second");
    answer = null;
    expect(await repoQuery(opts), "the newest value the database gave, not the oldest").toBe("second");
  });
});
