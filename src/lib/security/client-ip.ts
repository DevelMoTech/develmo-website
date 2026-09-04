// Client IP as seen behind Vercel's proxy. One implementation, shared by
// the request helpers (src/lib/auth/ip.ts) and the proxy's access control,
// so a rule written against the address in an event matches the address the
// proxy checks. No imports, so it bundles into src/proxy.ts.
export function proxyClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  return "unknown";
}
