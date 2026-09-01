import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

export const postType = pgEnum("post_type", ["blog", "kb"]);
export const postStatus = pgEnum("post_status", ["draft", "scheduled", "published", "archived"]);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Key inside the storage backend (Vercel Blob in production); unguessable.
  blobKey: text("blob_key").notNull().unique(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  replacedAt: timestamp("replaced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: postType("type").notNull().default("blog"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    bodyMd: text("body_md").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    // Display name kept as text to match the existing "DevelMo Team" byline.
    authorName: text("author_name").notNull().default("DevelMo Team"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    heroImageId: uuid("hero_image_id").references(() => media.id, { onDelete: "set null" }),
    status: postStatus("status").notNull().default("draft"),
    // For status=scheduled this is the future go-live time.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    readingTimeMin: integer("reading_time_min"),
    canonicalOverride: text("canonical_override"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageId: uuid("og_image_id").references(() => media.id, { onDelete: "set null" }),
    noindex: boolean("noindex").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_type_slug_uq").on(t.type, t.slug),
    index("posts_status_idx").on(t.status),
  ],
);

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // Full post field snapshot at save time.
    snapshot: jsonb("snapshot").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("post_revisions_post_id_idx").on(t.postId)],
);

export const postTranslations = pgTable(
  "post_translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title"),
    excerpt: text("excerpt"),
    bodyMd: text("body_md"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("post_translations_post_locale_uq").on(t.postId, t.locale)],
);

// Site content mirrored from the typed src/lib files: one row per entity+key,
// data validated by the matching zod schema before write, shaped exactly like
// the src/lib type so the repo layer can return it verbatim.
export const contentEntries = pgTable(
  "content_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // pillar | service | serviceDetail | industry | product | about | site | stats | tech
    entity: text("entity").notNull(),
    // The slug for collections, a fixed key for singletons (e.g. "site").
    key: text("key").notNull(),
    data: jsonb("data").notNull(),
    // Preserves array ordering from the source files.
    sortOrder: integer("sort_order").notNull().default(0),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("content_entries_entity_key_uq").on(t.entity, t.key)],
);

// Runtime overrides for the UI dictionary; extra.ts stays the seed + fallback.
export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locale: text("locale").notNull(),
    // Byte-identical to the English source string, per the i18n convention.
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("translations_locale_key_uq").on(t.locale, t.key)],
);
