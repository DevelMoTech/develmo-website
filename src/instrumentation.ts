// Runs once per server process, before any request. Node runtime only: the
// shim touches the process console, which the edge runtime does not share.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installDevConsoleShim } = await import("./lib/dev-console");
  installDevConsoleShim();
}
