import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deriveKey } from "@/lib/auth/secret";

// Object storage behind the media library (brief §3.10) and CV uploads
// (§3.4). Two backends with one interface:
//   - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production). Objects are
//     stored with private access and unguessable keys; library images are
//     served through /media/<key> so the CSP img-src stays 'self' and a
//     replace keeps the same URL; CVs only ever leave through a short-lived
//     signed download link.
//   - Local disk under .data/ (gitignored) otherwise, for development and
//     the e2e suite.
//
// Key shapes: images "<32 hex>.<jpg|png|gif|webp>", CVs "cv-<32 hex>.<pdf|docx>".

export type StorageBackend = "vercel-blob" | "local";

export const IMAGE_KEY_RE = /^[a-f0-9]{32}\.(jpg|png|gif|webp)$/;
export const CV_KEY_RE = /^cv-[a-f0-9]{32}\.(pdf|docx)$/;
export const KEY_RE = /^(?:[a-f0-9]{32}\.(?:jpg|png|gif|webp)|cv-[a-f0-9]{32}\.(?:pdf|docx))$/;

const LOCAL_ROOT = path.join(process.cwd(), ".data");

export function storageBackend(): StorageBackend {
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
}

// Private objects never get a public URL; only signed downloads.
export function isPrivateKey(key: string): boolean {
  return CV_KEY_RE.test(key);
}

export function publicUrlFor(key: string, version?: number): string {
  if (isPrivateKey(key)) throw new Error("private objects have no public URL");
  return version ? `/media/${key}?v=${version}` : `/media/${key}`;
}

function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error("invalid storage key");
}

function blobPath(key: string): string {
  return `${isPrivateKey(key) ? "cv" : "media"}/${key}`;
}

function localPath(key: string): string {
  return path.join(LOCAL_ROOT, isPrivateKey(key) ? "cv" : "media", key);
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  assertKey(key);
  if (storageBackend() === "vercel-blob") {
    const { put } = await import("@vercel/blob");
    await put(blobPath(key), Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      cacheControlMaxAge: 300,
    });
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export type StoredObject = { body: Uint8Array | ReadableStream<Uint8Array>; size: number | null };

export async function getObject(key: string): Promise<StoredObject | null> {
  assertKey(key);
  if (storageBackend() === "vercel-blob") {
    const { get } = await import("@vercel/blob");
    const res = await get(blobPath(key), { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return { body: res.stream, size: res.blob.size };
  }
  try {
    const file = localPath(key);
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
    await del(blobPath(key));
    return;
  }
  await rm(localPath(key), { force: true });
}

// Signed URL for downloading the original, valid for `ttlSeconds`. On Vercel
// Blob this is a presigned GET on the private object; locally it is the
// serving route with an HMAC token the route verifies. `filename` sets the
// download name where the backend supports it.
export async function signedDownloadUrl(key: string, ttlSeconds = 60): Promise<string> {
  assertKey(key);
  const validUntil = Date.now() + ttlSeconds * 1000;
  if (storageBackend() === "vercel-blob") {
    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    const pathname = blobPath(key);
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
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
