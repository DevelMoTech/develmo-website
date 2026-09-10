import { afterEach, describe, expect, it, vi } from "vitest";
import { describeStaleRefresh, installDevConsoleShim, isNextStaleRefreshLog } from "@/lib/dev-console";

// Next logs a failed background refresh of a stale unstable_cache entry with
// console.error, and the dev overlay shows that as a broken page. In
// development that one line becomes a warning; everything else, and
// everything in production, is left exactly as it was.

const nextLine = ["revalidating cache with key: async()=>{...}-repo,seo,organization-[]", new Error('Failed query: select "key" from "settings" where "settings"."key" = $1 limit $2')];

describe("isNextStaleRefreshLog", () => {
  it("recognises Next's stale refresh line and nothing else", () => {
    expect(isNextStaleRefreshLog(nextLine)).toBe(true);
    expect(isNextStaleRefreshLog(["[repo] repo:seo:organization fell back to the typed file data"])).toBe(false);
    expect(isNextStaleRefreshLog(["Invariant invalid cacheEntry returned for x"])).toBe(false);
    expect(isNextStaleRefreshLog([new Error("revalidating cache with key: not a string first arg")])).toBe(false);
    expect(isNextStaleRefreshLog([])).toBe(false);
  });

  it("keeps the underlying error's message in the warning", () => {
    expect(describeStaleRefresh(nextLine)).toContain('Failed query: select "key" from "settings"');
    expect(describeStaleRefresh(["revalidating cache with key: k", "plain detail"])).toContain("plain detail");
  });
});

describe("installDevConsoleShim", () => {
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
    delete (globalThis as { __develmoConsoleShim?: boolean }).__develmoConsoleShim;
    vi.restoreAllMocks();
  });

  it("does nothing in production", () => {
    const before = console.error;
    expect(installDevConsoleShim("production")).toBe(false);
    expect(console.error).toBe(before);
  });

  it("turns only the stale refresh line into a warning in development, and passes everything else through", () => {
    const error = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    console.error = error as unknown as typeof console.error;
    expect(installDevConsoleShim("development")).toBe(true);

    console.error(...nextLine);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("last good value is still being served");
    expect(String(warn.mock.calls[0][0])).toContain("Failed query");

    console.error("[audit] failed to write audit row", new Error("down"));
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe("[audit] failed to write audit row");
  });

  it("installs once", () => {
    expect(installDevConsoleShim("development")).toBe(true);
    const installed = console.error;
    expect(installDevConsoleShim("development")).toBe(false);
    expect(console.error).toBe(installed);
  });
});
