// Seeds the database from the typed src/lib content files (the migration
// source of truth, kept in the repo as the permanent fallback).
//
//   npm run db:seed            insert-only: never overwrites existing rows
//   npm run db:seed -- --force upsert: re-syncs rows from the files
//
// Requires DATABASE_URL (read from .env.local via --env-file-if-exists).

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { contentEntries, posts as postsTable } from "../src/db/schema/index.ts";
import { pillars, services } from "../src/lib/services.ts";
import { industries } from "../src/lib/industries.ts";
import { products } from "../src/lib/products.ts";
import { aboutContent } from "../src/lib/about.ts";
import { posts } from "../src/lib/posts.ts";
import { site, stats, tech } from "../src/lib/site.ts";

const force = process.argv.includes("--force");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool);

  // --- content_entries -------------------------------------------------------
  const entries: { entity: string; key: string; data: unknown; sortOrder: number }[] = [];
  pillars.forEach((p, i) => entries.push({ entity: "pillar", key: p.key, data: p, sortOrder: i }));
  services.forEach((s, i) => entries.push({ entity: "service", key: s.slug, data: s, sortOrder: i }));
  industries.forEach((x, i) => entries.push({ entity: "industry", key: x.slug, data: x, sortOrder: i }));
  products.forEach((x, i) => entries.push({ entity: "product", key: x.slug, data: x, sortOrder: i }));
  Object.entries(aboutContent).forEach(([key, data], i) =>
    entries.push({ entity: "about", key, data, sortOrder: i }),
  );
  entries.push({ entity: "site", key: "site", data: site, sortOrder: 0 });
  entries.push({ entity: "stats", key: "stats", data: stats, sortOrder: 0 });
  entries.push({ entity: "tech", key: "tech", data: tech, sortOrder: 0 });

  let contentCount = 0;
  for (const e of entries) {
    const base = db.insert(contentEntries).values({
      entity: e.entity,
      key: e.key,
      data: e.data,
      sortOrder: e.sortOrder,
    });
    const res = force
      ? await base.onConflictDoUpdate({
          target: [contentEntries.entity, contentEntries.key],
          set: { data: e.data, sortOrder: e.sortOrder, updatedAt: sql`now()` },
        })
      : await base.onConflictDoNothing();
    contentCount += res.rowCount ?? 0;
  }
  console.log(`content_entries: ${contentCount}/${entries.length} rows written`);

  // --- posts -----------------------------------------------------------------
  let postCount = 0;
  for (const p of posts) {
    const values = {
      type: "blog" as const,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      bodyMd: p.body.join("\n\n"),
      category: p.category,
      authorName: p.author,
      status: "published" as const,
      publishedAt: new Date(`${p.date}T00:00:00Z`),
    };
    const base = db.insert(postsTable).values(values);
    const res = force
      ? await base.onConflictDoUpdate({
          target: [postsTable.type, postsTable.slug],
          set: { ...values, updatedAt: sql`now()` },
        })
      : await base.onConflictDoNothing();
    postCount += res.rowCount ?? 0;
  }
  console.log(`posts: ${postCount}/${posts.length} rows written`);

  await pool.end();
  console.log(force ? "Seed complete (force upsert)." : "Seed complete (insert-only).");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
