import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { posts as postsTable } from "@/db/schema";
import { posts as filePosts, type Post } from "@/lib/posts";
import { repoQuery } from "./util";

export type { Post };

// A post is publicly visible when published, or when scheduled and its
// go-live time has passed (lazy scheduled publishing; the cron formalises it).
const visibleWhere = (type: "blog" | "kb") =>
  and(
    eq(postsTable.type, type),
    or(
      eq(postsTable.status, "published"),
      and(eq(postsTable.status, "scheduled"), lte(postsTable.publishedAt, sql`now()`)),
    ),
  );

type PostRow = typeof postsTable.$inferSelect;

function toPost(row: PostRow): Post {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    date: (row.publishedAt ?? row.createdAt).toISOString().slice(0, 10),
    category: row.category,
    author: row.authorName,
    body: row.bodyMd ? row.bodyMd.split(/\r?\n\r?\n+/) : [],
  };
}

export async function getPosts(type: "blog" | "kb" = "blog"): Promise<Post[]> {
  return repoQuery({
    keys: ["repo", "posts", "list", type],
    tags: ["posts"],
    query: async () => {
      const rows = await getDb()
        .select()
        .from(postsTable)
        .where(visibleWhere(type))
        .orderBy(desc(postsTable.publishedAt));
      return rows.map(toPost);
    },
    fallback: () => (type === "blog" ? filePosts : []),
  });
}

export async function getPost(slug: string, type: "blog" | "kb" = "blog"): Promise<Post | undefined> {
  return repoQuery({
    keys: ["repo", "posts", "by-slug", type, slug],
    tags: ["posts", `post:${slug}`],
    query: async () => {
      const rows = await getDb()
        .select()
        .from(postsTable)
        .where(and(visibleWhere(type), eq(postsTable.slug, slug)))
        .limit(1);
      return rows[0] ? toPost(rows[0]) : undefined;
    },
    fallback: () => (type === "blog" ? filePosts.find((p) => p.slug === slug) : undefined),
  });
}
