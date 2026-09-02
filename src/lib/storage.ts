import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deriveKey } from "@/lib/auth/secret";

// Object storage behind the media library (brief §3.10). Two backends with
// one interface:
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production). Objects are
//     stored with private access and unguessable keys; the public site serves
//     them through /media/<key> so the CSP img-src stays 'self' and a replace
//     keeps the same URL.
//   - Local disk under .data/media (gitignored) otherwise, for development
//     and the e2e suite.
// Short-lived signed URLs are issued for direct downloads of the original.

export type StorageBackend = "vercel-blob" | "local";

export const KEY_RE = /^[a-f0-9]{32}\.(jpg|png|gif|webp)$/;

const LOCAL_DIR = path.join(process.cwd(), ".data", "media");
const BLOB_PREFIX = "media/";

export function storageBackend(): StorageBackend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
}

export function publicUrlFor(key: string, version?: number): string {
  return version ? `/media/${key}?v=${version}` : `/media/${key}`;
}

function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error("invalid storage key");
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  assertKey(key);
  if (storageBackend() === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(BLOB_PREFIX + key, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      cacheControlMaxAge: 300,
    });
    return;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, key), bytes);
}

export type StoredObject = { body: Uint8Array | ReadableStream<Uint8Array>; size: number | null };

export async function getObject(key: string): Promise<StoredObject | null> {
  assertKey(key);
  if (storageBackend() === "vercel-blob") {
    const { get } = await import("@vercel/blob");
    const res = await get(BLOB_PREFIX + key, { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, size: res.blob.size };
  }
  try {
    const file = path.join(LOCAL_DIR, key);
    const s = await stat(file);
    return { body: new Uint8Array(await readFile(file)), size: s.size };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  assertKey(key);
  if (storageBackend() === "vercel-blob") {
    const { del } = await import("@vercel/blob");
    await del(BLOB_PREFIX + key);
    return;
  }
  await rm(path.join(LOCAL_DIR, key), { force: true });
}

// Signed URL for downloading the original, valid for `ttlSeconds`. On Vercel
// Blob this is a presigned GET on the private object; locally it is the
// serving route with an HMAC token the route verifies.
export async function signedDownloadUrl(key: string, ttlSeconds = 60): Promise<string> {
  assertKey(key);
  const validUntil = Date.now() + ttlSeconds * 1000;
  if (storageBackend() === "vercel-blob") {
    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    const token = await issueSignedToken({ pathname: BLOB_PREFIX + key, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: BLOB_PREFIX + key, access: "private", validUntil });
    return presignedUrl;
  }
  const exp = String(validUntil);
  return `/media/${key}?download=1&exp=${exp}&sig=${localSignature(key, exp)}`;
}

function localSignature(key: string, exp: string): string {
  return createHmac("sha256", deriveKey("media-download")).update(`${key}:${exp}`).digest("hex");
}

export function verifyLocalSignature(key: string, exp: string, sig: string): boolean {
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = localSignature(key, exp);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
