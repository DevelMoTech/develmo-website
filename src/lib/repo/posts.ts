import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { media, posts as postsTable, postTranslations } from "@/db/schema";
import { posts as filePosts, type Post } from "@/lib/posts";
import type { Locale } from "@/lib/i18n";
import { readingTimeMinutes } from "@/lib/slug";
import { repoQuery } from "./util";

export type { Post };
export type PostType = "blog" | "kb";

export type PublicImage = { url: string; alt: string; width: number | null; height: number | null };

// What the public templates render. Title, excerpt and body come back in the
// requested locale when a translation row has that field, English otherwise.
export type PublicPost = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO date, publication day
  updated: string; // ISO date
  category: string;
  author: string;
  bodyMd: string;
  readingTime: number;
  hero: PublicImage | null;
  seo: {
    metaTitle: string | null;
    metaDescription: string | null;
    canonical: string | null;
    ogImage: PublicImage | null;
    noindex: boolean;
  };
};

export const POST_BASE_PATH: Record<PostType, string> = { blog: "/our-blogs", kb: "/our-knowledge-base" };

// A post is publicly visible when published, or when scheduled and its
// go-live time has passed (lazy scheduled publishing; the cron formalises it).
const visibleWhere = (type: PostType) =>
  and(
    eq(postsTable.type, type),
    or(
      eq(postsTable.status, "published"),
      and(eq(postsTable.status, "scheduled"), lte(postsTable.publishedAt, sql`now()`)),
    ),
  );

const hero = alias(media, "hero");
const og = alias(media, "og");

type Joined = { post: typeof postsTable.$inferSelect; hero: typeof media.$inferSelect | null; og: typeof media.$inferSelect | null };
type Translation = { title: string | null; excerpt: string | null; bodyMd: string | null };

function image(m: typeof media.$inferSelect | null): PublicImage | null {
  return m ? { url: m.url, alt: m.altText, width: m.width, height: m.height } : null;
}

function toPublic(row: Joined, tr?: Translation): PublicPost {
  const p = row.post;
  const bodyMd = tr?.bodyMd || p.bodyMd;
  return {
    type: p.type,
    slug: p.slug,
    title: tr?.title || p.title,
    excerpt: tr?.excerpt || p.excerpt,
    date: (p.publishedAt ?? p.createdAt).toISOString().slice(0, 10),
    updated: p.updatedAt.toISOString().slice(0, 10),
    category: p.category,
    author: p.authorName,
    bodyMd,
    readingTime: p.readingTimeMin ?? readingTimeMinutes(bodyMd),
    hero: image(row.hero),
    seo: {
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      canonical: p.canonicalOverride,
      ogImage: image(row.og),
      noindex: p.noindex,
    },
  };
}

// The typed file data is the seed and the permanent fallback (brief §5.1).
export function fromFilePost(p: Post): PublicPost {
  const bodyMd = p.body.join("\n\n");
  return {
    type: "blog",
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    date: p.date,
    updated: p.date,
    category: p.category,
    author: p.author,
    bodyMd,
    readingTime: readingTimeMinutes(bodyMd),
    hero: null,
    seo: { metaTitle: null, metaDescription: null, canonical: null, ogImage: null, noindex: false },
  };
}

function selectJoined(where: ReturnType<typeof visibleWhere>) {
  return getDb()
    .select({ post: postsTable, hero, og })
    .from(postsTable)
    .leftJoin(hero, eq(postsTable.heroImageId, hero.id))
    .leftJoin(og, eq(postsTable.ogImageId, og.id))
    .where(where);
}

async function translationsFor(postIds: string[], locale: Locale): Promise<Map<string, Translation>> {
  const map = new Map<string, Translation>();
  if (locale === "en" || postIds.length === 0) return map;
  const rows = await getDb()
    .select({ postId: postTranslations.postId, title: postTranslations.title, excerpt: postTranslations.excerpt, bodyMd: postTranslations.bodyMd })
    .from(postTranslations)
    .where(and(inArray(postTranslations.postId, postIds), eq(postTranslations.locale, locale)));
  for (const r of rows) map.set(r.postId, r);
  return map;
}

// Any status, straight from the database, for the authenticated preview.
// Throws on database failure: a preview has no meaningful fallback.
export async function getPostByIdForPreview(id: string, locale: Locale = "en"): Promise<PublicPost | undefined> {
  const rows = await selectJoined(eq(postsTable.id, id)).limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const tr = await translationsFor([row.post.id], locale);
  return toPublic(row, tr.get(row.post.id));
}

export async function getPosts(type: PostType = "blog", locale: Locale = "en"): Promise<PublicPost[]> {
  return repoQuery({
    keys: ["repo", "posts", "list", type, locale],
    tags: ["posts"],
    query: async () => {
      const rows = await selectJoined(visibleWhere(type)).orderBy(desc(postsTable.publishedAt));
      const tr = await translationsFor(rows.map((r) => r.post.id), locale);
      return rows.map((r) => toPublic(r, tr.get(r.post.id)));
    },
    fallback: () => (type === "blog" ? filePosts.map(fromFilePost) : []),
  });
}

export async function getPost(slug: string, type: PostType = "blog", locale: Locale = "en"): Promise<PublicPost | undefined> {
  return repoQuery({
    keys: ["repo", "posts", "by-slug", type, slug, locale],
    tags: ["posts", `post:${slug}`],
    query: async () => {
      const rows = await selectJoined(and(visibleWhere(type), eq(postsTable.slug, slug))).limit(1);
      const row = rows[0];
      if (!row) return undefined;
      const tr = await translationsFor([row.post.id], locale);
      return toPublic(row, tr.get(row.post.id));
    },
    fallback: () => {
      const p = type === "blog" ? filePosts.find((x) => x.slug === slug) : undefined;
      return p ? fromFilePost(p) : undefined;
    },
  });
}
