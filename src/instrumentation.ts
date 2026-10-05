// Runs once per server process, before any request. Node runtime only: the
// shim touches the process console, which the edge runtime does not share.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installDevConsoleShim } = await import("./lib/dev-console");
  installDevConsoleShim();

  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    try {
      const [{ getDb }, { sql }] = await Promise.all([import("./db"), import("drizzle-orm")]);
      await getDb().execute(sql`select 1`);
      console.log("[database] startup probe succeeded");
    } catch (error) {
      console.error(`[database] startup probe failed: ${errorChain(error)}`);
    }
  }
}

function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const item = current as { code?: unknown; message?: unknown; cause?: unknown };
    const code = typeof item.code === "string" ? `${item.code} ` : "";
    const message = typeof item.message === "string" ? item.message.split("\n", 1)[0] : "unknown error";
    parts.push(`${code}${message}`);
    current = item.cause;
  }
  return parts.join(" <- ");
}
