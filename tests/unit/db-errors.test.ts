import { describe, expect, it } from "vitest";
import { DatabaseUnavailableError, isDatabaseUnavailable } from "@/db/errors";

// The shapes node-postgres and Drizzle actually produce when Postgres is
// down, restarting, or dropping connections, against the shapes a real bug
// produces. The classifier must say yes to the first and no to the second,
// or a genuine bug would be reported as an outage.

function drizzleWrapped(cause: unknown): Error {
  const e = new Error('Failed query: select "key" from "settings" where "settings"."key" = $1 limit $2');
  (e as Error & { cause?: unknown }).cause = cause;
  return e;
}

function coded(message: string, code: string): Error {
  const e = new Error(message);
  (e as Error & { code?: string }).code = code;
  return e;
}

describe("isDatabaseUnavailable", () => {
  it("recognises a refused connection, wrapped by Drizzle", () => {
    expect(isDatabaseUnavailable(drizzleWrapped(coded("connect ECONNREFUSED 127.0.0.1:54329", "ECONNREFUSED")))).toBe(true);
  });

  it("recognises the AggregateError Windows produces when every address is refused", () => {
    const agg = new AggregateError([coded("connect ECONNREFUSED ::1:54329", "ECONNREFUSED"), coded("connect ECONNREFUSED 127.0.0.1:54329", "ECONNREFUSED")], "");
    expect(isDatabaseUnavailable(drizzleWrapped(agg))).toBe(true);
  });

  it("recognises a server that is starting up, shutting down, or dropping the connection", () => {
    expect(isDatabaseUnavailable(coded("the database system is starting up", "57P03"))).toBe(true);
    expect(isDatabaseUnavailable(coded("terminating connection due to administrator command", "57P01"))).toBe(true);
    expect(isDatabaseUnavailable(coded("connection exception", "08006"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("repo query timed out after 3500ms"))).toBe(true);
  });

  it("does not mistake a real query error, a bug, or a constraint violation for an outage", () => {
    expect(isDatabaseUnavailable(drizzleWrapped(coded('relation "nope" does not exist', "42P01")))).toBe(false);
    expect(isDatabaseUnavailable(drizzleWrapped(coded("duplicate key value violates unique constraint", "23505")))).toBe(false);
    expect(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isDatabaseUnavailable(new Error("invalid_credentials"))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable("ECONNREFUSED")).toBe(false);
  });

  it("stops walking a cause chain rather than looping forever", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(isDatabaseUnavailable(a)).toBe(false);
  });
});

describe("DatabaseUnavailableError", () => {
  it("carries a message safe to show to a person and keeps the cause", () => {
    const cause = coded("connect ECONNREFUSED", "ECONNREFUSED");
    const e = new DatabaseUnavailableError(cause);
    expect(e.name).toBe("DatabaseUnavailableError");
    expect(e.message).toBe("The database is not reachable right now. Try again in a moment.");
    expect((e as Error & { cause?: unknown }).cause).toBe(cause);
    expect(isDatabaseUnavailable(e)).toBe(true);
  });
});
