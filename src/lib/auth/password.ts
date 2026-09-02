import { randomBytes } from "node:crypto";
import argon2 from "argon2";

// argon2id with the OWASP recommended minimum configuration
// (19 MiB memory, 2 iterations, 1 lane).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// A real argon2id hash of a random value. Login verifies against it when no
// account matches, so "unknown email" and "wrong password" cost the same time.
let dummy: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummy;
}
