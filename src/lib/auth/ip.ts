import { createHash } from "node:crypto";
import { deriveKey } from "./secret";

// Client IP as seen behind Vercel's proxy (x-real-ip / x-forwarded-for are set
// by the platform there). Locally these headers are whatever the client sends,
// which is what the e2e suite relies on to isolate rate-limit identities.
export function getClientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  return "unknown";
}

// IPs are stored only as a salted hash (brief §7.15). The salt is derived from
// AUTH_SECRET so it never lives in the database.
export function hashIp(ip: string): string {
  return createHash("sha256").update(deriveKey("ip-salt")).update(ip).digest("hex").slice(0, 40);
}
