import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { deriveKey } from "./secret";
import { sha256Hex } from "./tokens";

const ISSUER = "DevelMo Admin";

// TOTP secrets are encrypted at rest with AES-256-GCM under a key derived
// from AUTH_SECRET. Stored form: base64(iv | authTag | ciphertext).
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("totp"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("totp"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function totpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { margin: 1, width: 200 });
}

// How far a device clock may be off and still sign in: two steps (60 s)
// either side. RFC 6238 suggests one; phones set by hand are often further
// out, and the replay guard means a wider window costs nothing in replays.
const ACCEPT_TOLERANCE_S = 60;
// How far the diagnosis looks when a code is refused, so the message can say
// "your clock is about four minutes ahead" instead of "not accepted". It
// never accepts anything; it only explains.
const DIAGNOSE_TOLERANCE_S = 900;

export type TotpCheck =
  | { valid: true; step: number | null; delta: number }
  | { valid: false; reason: "malformed" }
  // The right code for a step already used: the same window twice.
  | { valid: false; reason: "replay" }
  // The right code for a clock this many seconds off ours (positive: ahead).
  | { valid: false; reason: "clock"; driftSeconds: number }
  | { valid: false; reason: "wrong" };

// Accepts the current step and up to two either side, and rejects any step at
// or before the last accepted one. A refusal says why, without accepting.
export async function verifyTotp(secret: string, token: string, lastStep: number | null): Promise<TotpCheck> {
  if (!/^\d{6}$/.test(token)) return { valid: false, reason: "malformed" };
  // A last step at or beyond the far edge of the window (a fast phone that
  // was accepted two steps ahead, then a second sign in within a minute)
  // makes the library throw rather than answer. Treat it as what it is: no
  // code in the window can be newer than the last one used.
  let result: Awaited<ReturnType<typeof verify>>;
  try {
    result = await verify({ secret, token, epochTolerance: ACCEPT_TOLERANCE_S, afterTimeStep: lastStep ?? undefined });
  } catch {
    result = { valid: false };
  }
  if (result.valid) {
    return { valid: true, step: "timeStep" in result ? result.timeStep : null, delta: "delta" in result ? result.delta : 0 };
  }
  if (lastStep !== null) {
    const withoutGuard = await verify({ secret, token, epochTolerance: ACCEPT_TOLERANCE_S });
    if (withoutGuard.valid) return { valid: false, reason: "replay" };
  }
  const drifted = await verify({ secret, token, epochTolerance: DIAGNOSE_TOLERANCE_S });
  if (drifted.valid && "delta" in drifted) return { valid: false, reason: "clock", driftSeconds: drifted.delta * 30 };
  return { valid: false, reason: "wrong" };
}

// Ten single-use recovery codes, shown once; only their hashes are stored.
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    let s = "";
    for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return sha256Hex(`recovery:${normaliseRecoveryCode(code)}`);
}
