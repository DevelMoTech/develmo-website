import { createHash } from "node:crypto";

// AUTH_SECRET is the single server-side secret. Every derived key (token
// signing, TOTP secret encryption, IP hashing salt) is a labelled SHA-256 of
// it, so rotating one env var rotates everything and nothing else is stored.

export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return s;
}

export function deriveKey(label: string): Buffer {
  return createHash("sha256").update(`develmo:${label}:`).update(getAuthSecret()).digest();
}
