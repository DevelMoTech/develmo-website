import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { media, postRevisions, posts, postTranslations, redirects } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { UserRow } from "@/lib/auth/session";
import { POST_BASE_PATH, type PostType } from "@/lib/repo/posts";
import { revalidatePosts } from "@/lib/repo/revalidate";
import { revalidateTag } from "next/cache";
import { REDIRECTS_TAG } from "@/lib/seo/redirect-map";
import { TRANSLATION_LOCALES, type PostInput, type TranslationLocale } from "@/lib/schemas/post";
import { readingTimeMinutes } from "@/lib/slug";

// Post mutations behind /api/admin/posts/* (brief §3.3). Every write:
//   1. validates media references (an image needs alt text to be attached),
//   2. checks slug uniqueness per type,
//   3. writes the row and its translations,
//   4. writes a revision snapshot,
//   5. writes an append-only audit row,
//   6. revalidates the public cache tags.

export type PostRow = typeof posts.$inferSelect;
export type TranslationRow = typeof postTranslations.$inferSelect;
export type RevisionRow = typeof postRevisions.$inferSelect;

export type TranslationFields = { title: string; excerpt: string; bodyMd: string };
export type TranslationMap = Partial<Record<TranslationLocale, TranslationFields>>;

// The revision snapshot: the editable columns plus translations.
export type PostSnapshot = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  category: string;
  tags: string[];
  authorName: string;
  heroImageId: string | null;
  status: PostRow["status"];
  publishedAt: string | null;
  canonicalOverride: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageId: string | null;
  noindex: boolean;
  translations: TranslationMap;
};

type Actor = { user: UserRow; ipHash: string | null };

export type PostError = { ok: false; code: "not_found" | "slug_taken" | "media_missing" | "media_alt" | "revision_not_found"; field?: string };

export function postPath(type: PostType, slug: string): string {
  return `${POST_BASE_PATH[type]}/${slug}`;
}

export function snapshotOf(row: PostRow, translations: TranslationRow[]): PostSnapshot {
  const tr: TranslationMap = {};
  for (const t of translations) {
    if ((TRANSLATION_LOCALES as readonly string[]).includes(t.locale)) {
      tr[t.locale as TranslationLocale] = { title: t.title ?? "", excerpt: t.excerpt ?? "", bodyMd: t.bodyMd ?? "" };
    }
  }
  return {
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.bodyMd,
    category: row.category,
    tags: row.tags,
    authorName: row.authorName,
    heroImageId: row.heroImageId,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    canonicalOverride: row.canonicalOverride,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageId: row.ogImageId,
    noindex: row.noindex,
    translations: tr,
  };
}

export async function loadPost(id: string): Promise<{ row: PostRow; translations: TranslationRow[] } | null> {
  const db = getDb();
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!rows[0]) return null;
  const translations = await db.select().from(postTranslations).where(eq(postTranslations.postId, id));
  return { row: rows[0], translations };
}

export async function slugAvailable(type: PostType, slug: string, excludeId?: string): Promise<boolean> {
  const where = excludeId ? and(eq(posts.type, type), eq(posts.slug, slug), ne(posts.id, excludeId)) : and(eq(posts.type, type), eq(posts.slug, slug));
  const rows = await getDb().select({ id: posts.id }).from(posts).where(where).limit(1);
  return rows.length === 0;
}

// Media referenced by a post must exist and carry alt text (brief §3.10).
async function checkMedia(ids: (string | null)[], fields: string[]): Promise<PostError | null> {
  const wanted = ids.map((id, i) => ({ id, field: fields[i] })).filter((x): x is { id: string; field: string } => !!x.id);
  if (wanted.length === 0) return null;
  const rows = await getDb()
    .select({ id: media.id, altText: media.altText })
    .from(media)
    .where(inArray(media.id, wanted.map((w) => w.id)));
  for (const w of wanted) {
    const m = rows.find((r) => r.id === w.id);
    if (!m) return { ok: false, code: "media_missing", field: w.field };
    if (!m.altText.trim()) return { ok: false, code: "media_alt", field: w.field };
  }
  return null;
}

function columnsFrom(input: PostInput, now: Date) {
  // A post published without a time is published now; a draft keeps whatever
  // time it had so re-publishing preserves the original date.
  const publishedAt = input.status === "published" && !input.publishedAt ? now : input.publishedAt;
  return {
    type: input.type,
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    bodyMd: input.bodyMd,
    category: input.category,
    tags: input.tags,
    authorName: input.authorName,
    heroImageId: input.heroImageId,
    status: input.status,
    publishedAt,
    readingTimeMin: readingTimeMinutes(input.bodyMd),
    canonicalOverride: input.canonicalOverride,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    ogImageId: input.ogImageId,
    noindex: input.noindex,
  };
}

async function writeTranslations(postId: string, translations: TranslationMap): Promise<void> {
  const db = getDb();
  for (const locale of TRANSLATION_LOCALES) {
    const t = translations[locale];
    const empty = !t || (!t.title && !t.excerpt && !t.bodyMd);
    if (empty) {
      await db.delete(postTranslations).where(and(eq(postTranslations.postId, postId), eq(postTranslations.locale, locale)));
      continue;
    }
    await db
      .insert(postTranslations)
      .values({ postId, locale, title: t.title || null, excerpt: t.excerpt || null, bodyMd: t.bodyMd || null })
      .onConflictDoUpdate({
        target: [postTranslations.postId, postTranslations.locale],
        set: { title: t.title || null, excerpt: t.excerpt || null, bodyMd: t.bodyMd || null, updatedAt: sql`now()` },
      });
  }
}

export async function writeRevision(postId: string, snapshot: PostSnapshot, note: string, actorId: string | null): Promise<void> {
  await getDb().insert(postRevisions).values({ postId, snapshot, note, createdById: actorId });
}

function translationsFromInput(input: PostInput): TranslationMap {
  const out: TranslationMap = {};
  for (const locale of TRANSLATION_LOCALES) {
    const t = input.translations[locale];
    if (t) out[locale] = { title: t.title, excerpt: t.excerpt, bodyMd: t.bodyMd };
  }
  return out;
}

export async function createPost(input: PostInput, actor: Actor): Promise<{ ok: true; id: string } | PostError> {
  const mediaErr = await checkMedia([input.heroImageId, input.ogImageId], ["heroImageId", "ogImageId"]);
  if (mediaErr) return mediaErr;
  if (!(await slugAvailable(input.type, input.slug))) return { ok: false, code: "slug_taken", field: "slug" };
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(posts)
    .values({ ...columnsFrom(input, now), createdById: actor.user.id, updatedById: actor.user.id })
    .returning();
  await writeTranslations(row.id, translationsFromInput(input));
  const after = await loadPost(row.id);
  const snapshot = snapshotOf(after!.row, after!.translations);
  await writeRevision(row.id, snapshot, "Created", actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: row.status === "published" ? "post.publish" : "post.create", entityType: "post", entityId: row.id, after: snapshot, ipHash: actor.ipHash });
  revalidatePosts([row.slug]);
  return { ok: true, id: row.id };
}

export type UpdateResult = { ok: true; redirectCreated: boolean } | PostError;

export async function updatePost(input: PostInput & { id: string; createRedirect: boolean }, actor: Actor): Promise<UpdateResult> {
  const current = await loadPost(input.id);
  if (!current) return { ok: false, code: "not_found" };
  const mediaErr = await checkMedia([input.heroImageId, input.ogImageId], ["heroImageId", "ogImageId"]);
  if (mediaErr) return mediaErr;
  if (!(await slugAvailable(input.type, input.slug, input.id))) return { ok: false, code: "slug_taken", field: "slug" };

  const db = getDb();
  const before = snapshotOf(current.row, current.translations);
  const now = new Date();
  const cols = columnsFrom(input, now);
  // Keep the original publish date when a published post is edited without
  // touching the date field.
  if (cols.status === "published" && !input.publishedAt && current.row.publishedAt) cols.publishedAt = current.row.publishedAt;
  await db
    .update(posts)
    .set({ ...cols, updatedById: actor.user.id, updatedAt: now })
    .where(eq(posts.id, input.id));
  await writeTranslations(input.id, translationsFromInput(input));

  const after = await loadPost(input.id);
  const snapshot = snapshotOf(after!.row, after!.translations);

  // A moved address gets a 301 from the old one when the post had been
  // reachable there (anything but a never-published draft) (brief §3.3).
  const oldPath = postPath(before.type, before.slug);
  const newPath = postPath(snapshot.type, snapshot.slug);
  let redirectCreated = false;
  if (oldPath !== newPath && input.createRedirect && before.status !== "draft") {
    await upsertRedirect(oldPath, newPath, `Post slug changed: ${snapshot.title}`, actor);
    redirectCreated = true;
  }

  const statusChanged = before.status !== snapshot.status;
  const action = statusChanged ? `post.${snapshot.status === "published" ? "publish" : snapshot.status === "scheduled" ? "schedule" : snapshot.status === "archived" ? "archive" : "unpublish"}` : "post.update";
  await writeRevision(input.id, snapshot, statusChanged ? `Status ${before.status} to ${snapshot.status}` : "Saved", actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action, entityType: "post", entityId: input.id, before, after: snapshot, ipHash: actor.ipHash });
  revalidatePosts([before.slug, snapshot.slug]);
  return { ok: true, redirectCreated };
}

// Redirect write path (the manager UI is the SEO phase). Avoids chains and
// loops: anything pointing at the old address now points at the new one, and
// a redirect whose source is the new address is removed.
async function upsertRedirect(source: string, destination: string, note: string, actor: Actor): Promise<void> {
  const db = getDb();
  await db.delete(redirects).where(eq(redirects.source, destination));
  await db.update(redirects).set({ destination, updatedAt: sql`now()` }).where(eq(redirects.destination, source));
  await db
    .insert(redirects)
    .values({ source, destination, code: 301, enabled: true, note, createdById: actor.user.id })
    .onConflictDoUpdate({ target: redirects.source, set: { destination, code: 301, enabled: true, note, updatedAt: sql`now()` } });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "redirect.create", entityType: "redirect", entityId: source, after: { source, destination, code: 301 }, ipHash: actor.ipHash });
  revalidateTag(REDIRECTS_TAG, { expire: 0 });
}

export async function deletePosts(ids: string[], actor: Actor): Promise<{ deleted: number }> {
  const db = getDb();
  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  if (rows.length === 0) return { deleted: 0 };
  await db.delete(posts).where(inArray(posts.id, rows.map((r) => r.id)));
  for (const r of rows) {
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "post.delete", entityType: "post", entityId: r.id, before: snapshotOf(r, []), ipHash: actor.ipHash });
  }
  revalidatePosts(rows.map((r) => r.slug));
  return { deleted: rows.length };
}

export type BulkAction = "publish" | "unpublish" | "archive" | "retag";

export async function bulkUpdate(ids: string[], action: BulkAction, opts: { addTags: string[]; removeTags: string[] }, actor: Actor): Promise<{ changed: number }> {
  const db = getDb();
  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  let changed = 0;
  const now = new Date();
  for (const row of rows) {
    const translations = await db.select().from(postTranslations).where(eq(postTranslations.postId, row.id));
    const before = snapshotOf(row, translations);
    const patch: Partial<PostRow> = {};
    if (action === "publish") {
      if (row.status === "published") continue;
      patch.status = "published";
      if (!row.publishedAt || row.publishedAt.getTime() > now.getTime()) patch.publishedAt = now;
    } else if (action === "unpublish") {
      if (row.status === "draft") continue;
      patch.status = "draft";
    } else if (action === "archive") {
      if (row.status === "archived") continue;
      patch.status = "archived";
    } else {
      const next = [...new Set([...row.tags.filter((t) => !opts.removeTags.includes(t)), ...opts.addTags])];
      if (next.length === row.tags.length && next.every((t) => row.tags.includes(t))) continue;
      patch.tags = next;
    }
    await db.update(posts).set({ ...patch, updatedById: actor.user.id, updatedAt: now }).where(eq(posts.id, row.id));
    const after = await loadPost(row.id);
    const snapshot = snapshotOf(after!.row, after!.translations);
    await writeRevision(row.id, snapshot, `Bulk ${action}`, actor.user.id);
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: `post.${action}`, entityType: "post", entityId: row.id, before, after: snapshot, ipHash: actor.ipHash });
    changed += 1;
  }
  revalidatePosts(rows.map((r) => r.slug));
  return { changed };
}

export async function listRevisions(postId: string): Promise<RevisionRow[]> {
  return getDb().select().from(postRevisions).where(eq(postRevisions.postId, postId)).orderBy(desc(postRevisions.createdAt));
}

export type RestoreResult = { ok: true; slugKept: boolean } | PostError;

export async function restoreRevision(postId: string, revisionId: string, actor: Actor): Promise<RestoreResult> {
  const db = getDb();
  const current = await loadPost(postId);
  if (!current) return { ok: false, code: "not_found" };
  const rev = (await db.select().from(postRevisions).where(and(eq(postRevisions.id, revisionId), eq(postRevisions.postId, postId))).limit(1))[0];
  if (!rev) return { ok: false, code: "revision_not_found" };
  const snap = rev.snapshot as PostSnapshot;
  const before = snapshotOf(current.row, current.translations);

  // Media may have been deleted since; drop dangling references rather than
  // fail the restore. A slug that is now taken keeps the current slug.
  const [heroOk, ogOk] = await Promise.all([mediaExists(snap.heroImageId), mediaExists(snap.ogImageId)]);
  let slug = snap.slug;
  let slugKept = false;
  if (slug !== current.row.slug && !(await slugAvailable(snap.type, slug, postId))) {
    slug = current.row.slug;
    slugKept = true;
  }
  const now = new Date();
  await db
    .update(posts)
    .set({
      type: snap.type,
      slug,
      title: snap.title,
      excerpt: snap.excerpt,
      bodyMd: snap.bodyMd,
      category: snap.category,
      tags: snap.tags,
      authorName: snap.authorName,
      heroImageId: heroOk ? snap.heroImageId : null,
      status: snap.status,
      publishedAt: snap.publishedAt ? new Date(snap.publishedAt) : null,
      readingTimeMin: readingTimeMinutes(snap.bodyMd),
      canonicalOverride: snap.canonicalOverride,
      metaTitle: snap.metaTitle,
      metaDescription: snap.metaDescription,
      ogImageId: ogOk ? snap.ogImageId : null,
      noindex: snap.noindex,
      updatedById: actor.user.id,
      updatedAt: now,
    })
    .where(eq(posts.id, postId));
  await writeTranslations(postId, snap.translations ?? {});
  const after = await loadPost(postId);
  const snapshot = snapshotOf(after!.row, after!.translations);
  // A restore that moves the address gets the same 301 treatment as an edit,
  // which also removes any stale redirect whose source is the restored path.
  const oldPath = postPath(before.type, before.slug);
  const newPath = postPath(snapshot.type, snapshot.slug);
  if (oldPath !== newPath && before.status !== "draft") {
    await upsertRedirect(oldPath, newPath, `Post restored to an earlier slug: ${snapshot.title}`, actor);
  }
  await writeRevision(postId, snapshot, `Restored revision from ${rev.createdAt.toISOString().slice(0, 16).replace("T", " ")}`, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "post.restore", entityType: "post", entityId: postId, before, after: snapshot, ipHash: actor.ipHash });
  revalidatePosts([before.slug, snapshot.slug]);
  return { ok: true, slugKept };
}

async function mediaExists(id: string | null): Promise<boolean> {
  if (!id) return false;
  const rows = await getDb().select({ id: media.id }).from(media).where(eq(media.id, id)).limit(1);
  return rows.length > 0;
}

// Scheduled posts whose time has come: flip to published and revalidate.
// Called by /api/cron/publish; the repo layer also treats due scheduled
// posts as visible, so a late cron never hides a post.
export async function publishDuePosts(): Promise<{ published: string[] }> {
  const db = getDb();
  const due = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), sql`${posts.publishedAt} <= now()`));
  const slugs: string[] = [];
  for (const row of due) {
    await db.update(posts).set({ status: "published", updatedAt: new Date() }).where(eq(posts.id, row.id));
    const after = await loadPost(row.id);
    const snapshot = snapshotOf(after!.row, after!.translations);
    await writeRevision(row.id, snapshot, "Published by schedule", null);
    await audit({ actorId: null, actorEmail: "cron", action: "post.publish", entityType: "post", entityId: row.id, before: snapshotOf(row, after!.translations), after: snapshot });
    slugs.push(row.slug);
  }
  if (slugs.length) revalidatePosts(slugs);
  return { published: slugs };
}
