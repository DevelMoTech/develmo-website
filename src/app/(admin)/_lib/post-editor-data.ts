import { asc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { media, posts } from "@/db/schema";
import { toView } from "@/lib/admin/media";
import { loadPost, type PostRow } from "@/lib/admin/posts";
import { TRANSLATION_LOCALES, type TranslationLocale } from "@/lib/schemas/post";
import { emptyTranslations, type EditorValue } from "./editor-types";

// Shapes a stored post (plus its media and translations) for the editor.
export async function editorValueFor(id: string): Promise<{ value: EditorValue; row: PostRow } | null> {
  const loaded = await loadPost(id);
  if (!loaded) return null;
  const { row, translations } = loaded;
  const ids = [row.heroImageId, row.ogImageId].filter((x): x is string => !!x);
  const mediaRows = ids.length ? await getDb().select().from(media).where(inArray(media.id, ids)) : [];
  const find = (mid: string | null) => {
    const m = mid ? mediaRows.find((r) => r.id === mid) : undefined;
    return m ? toView(m) : null;
  };
  const tr = emptyTranslations();
  for (const t of translations) {
    if ((TRANSLATION_LOCALES as readonly string[]).includes(t.locale)) {
      tr[t.locale as TranslationLocale] = { title: t.title ?? "", excerpt: t.excerpt ?? "", bodyMd: t.bodyMd ?? "" };
    }
  }
  return {
    row,
    value: {
      type: row.type,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      bodyMd: row.bodyMd,
      category: row.category,
      tags: row.tags,
      authorName: row.authorName,
      heroImage: find(row.heroImageId),
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      canonicalOverride: row.canonicalOverride ?? "",
      metaTitle: row.metaTitle ?? "",
      metaDescription: row.metaDescription ?? "",
      ogImage: find(row.ogImageId),
      noindex: row.noindex,
      translations: tr,
    },
  };
}

export function blankEditorValue(type: "blog" | "kb" = "blog"): EditorValue {
  return {
    type,
    title: "",
    slug: "",
    excerpt: "",
    bodyMd: "",
    category: "",
    tags: [],
    authorName: "DevelMo Team",
    heroImage: null,
    status: "draft",
    publishedAt: null,
    canonicalOverride: "",
    metaTitle: "",
    metaDescription: "",
    ogImage: null,
    noindex: false,
    translations: emptyTranslations(),
  };
}

export async function existingCategories(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ category: posts.category }).from(posts).where(sql`${posts.category} <> ''`).orderBy(asc(posts.category));
  return rows.map((r) => r.category);
}

export async function revisionCount(postId: string): Promise<number> {
  const rows = await getDb().execute<{ n: string }>(sql`select count(*)::text as n from post_revisions where post_id = ${postId}`);
  return Number((rows.rows as { n: string }[])[0]?.n ?? 0);
}

// Visible on the public site right now: published, or scheduled and due.
export function isLive(row: Pick<PostRow, "status" | "publishedAt">): boolean {
  return row.status === "published" || (row.status === "scheduled" && !!row.publishedAt && row.publishedAt.getTime() <= Date.now());
}
