// Telling "the database is not reachable" apart from every other failure.
//
// Drizzle wraps a driver error as "Failed query: ..." with the driver's error
// as `cause`; node-postgres reports a refused or dropped connection with a
// Node error code, and a server that is shutting down or still starting with
// a SQLSTATE in class 08 (connection exception) or 57P0x (operator
// intervention). On Windows a refused connect can also arrive as an
// AggregateError holding one error per address tried.

const NODE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);
const MESSAGES = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /the database system is (starting up|shutting down)/i,
  /terminating connection/i,
  /connection refused/i,
  /server closed the connection unexpectedly/i,
  /client has encountered a connection error/i,
  /repo query timed out/i,
];

type ErrLike = { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };

function matches(e: ErrLike): boolean {
  const code = typeof e.code === "string" ? e.code : "";
  if (NODE_CODES.has(code)) return true;
  if (/^08/.test(code) || /^57P0[1-3]$/.test(code)) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return MESSAGES.some((re) => re.test(message));
}

export function isDatabaseUnavailable(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 6) return false;
  const e = err as ErrLike;
  if (matches(e)) return true;
  if (Array.isArray(e.errors) && e.errors.some((inner) => isDatabaseUnavailable(inner, depth + 1))) return true;
  return isDatabaseUnavailable(e.cause, depth + 1);
}

// Thrown by the page-side session loader so a page gate can tell an outage
// from a signed-out visitor. The message is safe to show to a person.
export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The database is not reachable right now. Try again in a moment.", cause instanceof Error ? { cause } : undefined);
    this.name = "DatabaseUnavailableError";
  }
}

export function describeDbError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
