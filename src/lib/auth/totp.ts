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

// Accepts the current step and one step either side (clock drift), and rejects
// any step at or before the last accepted one (replay inside the window).
export async function verifyTotp(
  secret: string,
  token: string,
  lastStep: number | null,
): Promise<{ valid: boolean; step: number | null }> {
  if (!/^\d{6}$/.test(token)) return { valid: false, step: null };
  const result = await verify({
    secret,
    token,
    epochTolerance: 30,
    afterTimeStep: lastStep ?? undefined,
  });
  if (!result.valid) return { valid: false, step: null };
  return { valid: true, step: "timeStep" in result ? result.timeStep : null };
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
