import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { media, posts } from "@/db/schema";
import { apiError } from "@/lib/auth/api";
import { audit, securityEvent } from "@/lib/auth/log";
import type { UserRow } from "@/lib/auth/session";
import { CONTENT_TYPES, EXTENSIONS, imageDimensions, MAX_UPLOAD_BYTES, sniffImage, stripMetadata, typeFromExtension } from "@/lib/images";
import { deleteObject, publicUrlFor, putObject } from "@/lib/storage";

// Media library operations (brief §3.10). Bytes are sniffed, stripped and
// stored under an unguessable key; the row carries the sniffed content type
// and the dimensions read from the header.

export type MediaRow = typeof media.$inferSelect;
type Actor = { user: UserRow; ipHash: string | null; userAgent?: string | null; path?: string };

export type MediaView = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  altText: string;
  folder: string;
  tags: string[];
  createdAt: string;
  replacedAt: string | null;
};

export function toView(m: MediaRow): MediaView {
  return {
    id: m.id,
    url: m.url,
    filename: m.filename,
    contentType: m.contentType,
    size: m.size,
    width: m.width,
    height: m.height,
    altText: m.altText,
    folder: m.folder,
    tags: m.tags,
    createdAt: m.createdAt.toISOString(),
    replacedAt: m.replacedAt?.toISOString() ?? null,
  };
}

export type UploadRejection = { ok: false; code: "too_large" | "empty" | "svg_rejected" | "unsupported_type" | "type_mismatch" };

export function rejectionResponse(r: UploadRejection) {
  const status = r.code === "too_large" ? 413 : r.code === "empty" ? 400 : 415;
  return apiError(status, r.code, { maxBytes: MAX_UPLOAD_BYTES });
}

export function cleanFilename(name: string, ext: string): string {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .trim()
    .slice(0, 150);
  const stem = base.replace(/\.[a-z0-9]+$/i, "") || "image";
  return `${stem}.${ext}`;
}

// Validates and normalises an upload: returns the bytes to store and what
// they are, or a rejection. Never trusts the client's name or MIME type.
export async function prepareUpload(file: File, actor: Actor): Promise<{ ok: true; bytes: Uint8Array; type: keyof typeof CONTENT_TYPES; width: number | null; height: number | null } | UploadRejection> {
  if (file.size === 0) return { ok: false, code: "empty" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, code: "too_large" };
  const raw = new Uint8Array(await file.arrayBuffer());
  const sniff = sniffImage(raw);
  if (!sniff.ok) {
    const code = sniff.reason === "svg" ? "svg_rejected" : sniff.reason === "empty" ? "empty" : "unsupported_type";
    await securityEvent({
      type: "upload_rejected",
      userId: actor.user.id,
      email: actor.user.email,
      ipHash: actor.ipHash,
      path: actor.path ?? "/api/admin/media/upload",
      userAgent: actor.userAgent ?? null,
      meta: { reason: code, claimedType: file.type, name: file.name.slice(0, 120), size: file.size },
    });
    return { ok: false, code };
  }
  const bytes = stripMetadata(raw, sniff.type);
  const dims = imageDimensions(bytes, sniff.type);
  return { ok: true, bytes, type: sniff.type, width: dims?.width ?? null, height: dims?.height ?? null };
}

export async function storeNewMedia(file: File, opts: { altText: string; folder: string; tags: string[] }, actor: Actor): Promise<{ ok: true; media: MediaView } | UploadRejection> {
  const prepared = await prepareUpload(file, actor);
  if (!prepared.ok) return prepared;
  const ext = EXTENSIONS[prepared.type];
  const key = `${randomBytes(16).toString("hex")}.${ext}`;
  const contentType = CONTENT_TYPES[prepared.type];
  await putObject(key, prepared.bytes, contentType);
  const [row] = await getDb()
    .insert(media)
    .values({
      blobKey: key,
      url: publicUrlFor(key),
      filename: cleanFilename(file.name, ext),
      contentType,
      size: prepared.bytes.length,
      width: prepared.width,
      height: prepared.height,
      altText: opts.altText,
      folder: opts.folder,
      tags: opts.tags,
      uploadedById: actor.user.id,
    })
    .returning();
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "media.upload", entityType: "media", entityId: row.id, after: toView(row), ipHash: actor.ipHash });
  return { ok: true, media: toView(row) };
}

// Replace keeps the key, so the URL stays the same apart from a cache-busting
// version. The replacement must be the same format because the key carries
// the extension and the serving route derives the content type from it.
export async function replaceMedia(id: string, file: File, actor: Actor): Promise<{ ok: true; media: MediaView } | UploadRejection | { ok: false; code: "not_found" }> {
  const db = getDb();
  const current = (await db.select().from(media).where(eq(media.id, id)).limit(1))[0];
  if (!current) return { ok: false, code: "not_found" };
  const prepared = await prepareUpload(file, actor);
  if (!prepared.ok) return prepared;
  const currentType = typeFromExtension(current.blobKey.split(".").pop() ?? "");
  if (currentType !== prepared.type) return { ok: false, code: "type_mismatch" };
  await putObject(current.blobKey, prepared.bytes, CONTENT_TYPES[prepared.type]);
  const now = new Date();
  const [row] = await db
    .update(media)
    .set({
      url: publicUrlFor(current.blobKey, now.getTime()),
      size: prepared.bytes.length,
      width: prepared.width,
      height: prepared.height,
      replacedAt: now,
      updatedAt: now,
    })
    .where(eq(media.id, id))
    .returning();
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "media.replace", entityType: "media", entityId: id, before: toView(current), after: toView(row), ipHash: actor.ipHash });
  return { ok: true, media: toView(row) };
}

export async function updateMedia(input: { id: string; altText: string; folder: string; tags: string[]; filename: string }, actor: Actor): Promise<{ ok: true; media: MediaView } | { ok: false; code: "not_found" }> {
  const db = getDb();
  const current = (await db.select().from(media).where(eq(media.id, input.id)).limit(1))[0];
  if (!current) return { ok: false, code: "not_found" };
  const ext = current.blobKey.split(".").pop() ?? "";
  const [row] = await db
    .update(media)
    .set({ altText: input.altText, folder: input.folder, tags: input.tags, filename: cleanFilename(input.filename, ext), updatedAt: new Date() })
    .where(eq(media.id, input.id))
    .returning();
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "media.update", entityType: "media", entityId: input.id, before: toView(current), after: toView(row), ipHash: actor.ipHash });
  return { ok: true, media: toView(row) };
}

export type Usage = { postId: string; title: string; status: string; via: "hero" | "og" | "body" };

// Where a file is referenced: post hero, post OG image, or an image URL
// inside a post body. Jobs and pages join this list in their own phases.
export async function mediaUsage(rows: Pick<MediaRow, "id" | "blobKey">[]): Promise<Map<string, Usage[]>> {
  const out = new Map<string, Usage[]>();
  if (rows.length === 0) return out;
  const ids = rows.map((r) => r.id);
  const bodyClauses = rows.map((r) => ilike(posts.bodyMd, `%/media/${r.blobKey}%`));
  const hits = await getDb()
    .select({ id: posts.id, title: posts.title, status: posts.status, heroImageId: posts.heroImageId, ogImageId: posts.ogImageId, bodyMd: posts.bodyMd })
    .from(posts)
    .where(or(inArray(posts.heroImageId, ids), inArray(posts.ogImageId, ids), ...bodyClauses));
  for (const r of rows) {
    const list: Usage[] = [];
    for (const p of hits) {
      if (p.heroImageId === r.id) list.push({ postId: p.id, title: p.title, status: p.status, via: "hero" });
      if (p.ogImageId === r.id) list.push({ postId: p.id, title: p.title, status: p.status, via: "og" });
      if (p.bodyMd.includes(`/media/${r.blobKey}`)) list.push({ postId: p.id, title: p.title, status: p.status, via: "body" });
    }
    out.set(r.id, list);
  }
  return out;
}

export async function deleteMedia(id: string, actor: Actor): Promise<{ ok: true } | { ok: false; code: "not_found" } | { ok: false; code: "in_use"; usage: Usage[] }> {
  const db = getDb();
  const current = (await db.select().from(media).where(eq(media.id, id)).limit(1))[0];
  if (!current) return { ok: false, code: "not_found" };
  const usage = (await mediaUsage([current])).get(id) ?? [];
  if (usage.length > 0) return { ok: false, code: "in_use", usage };
  await db.delete(media).where(eq(media.id, id));
  await deleteObject(current.blobKey).catch((err) => console.error("[media] object delete failed", current.blobKey, err));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "media.delete", entityType: "media", entityId: id, before: toView(current), ipHash: actor.ipHash });
  return { ok: true };
}

export const MEDIA_PAGE_SIZE = 24;

export async function listMedia(q: { q: string; folder: string; tag: string; page: number; withAlt?: boolean; sort?: "newest" | "oldest" | "name" }): Promise<{ rows: MediaRow[]; total: number }> {
  const clauses: SQL[] = [];
  if (q.q) {
    const needle = `%${q.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(or(ilike(media.filename, needle), ilike(media.altText, needle))!);
  }
  if (q.folder) clauses.push(q.folder === "/" ? eq(media.folder, "") : eq(media.folder, q.folder));
  if (q.tag) clauses.push(sql`${q.tag} = any(${media.tags})`);
  if (q.withAlt) clauses.push(sql`${media.altText} <> ''`);
  const where = clauses.length ? and(...clauses) : undefined;
  const order = q.sort === "oldest" ? asc(media.createdAt) : q.sort === "name" ? asc(media.filename) : desc(media.createdAt);
  const db = getDb();
  const [rows, totalRow] = await Promise.all([
    db.select().from(media).where(where).orderBy(order).limit(MEDIA_PAGE_SIZE).offset((q.page - 1) * MEDIA_PAGE_SIZE),
    db.select({ n: count() }).from(media).where(where),
  ]);
  return { rows, total: totalRow[0]?.n ?? 0 };
}

export async function listFolders(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ folder: media.folder }).from(media).orderBy(asc(media.folder));
  return rows.map((r) => r.folder).filter(Boolean);
}

export async function listTags(): Promise<string[]> {
  const rows = await getDb().execute<{ tag: string }>(sql`select distinct unnest(${media.tags}) as tag from ${media} order by tag`);
  return (rows.rows as { tag: string }[]).map((r) => r.tag);
}
