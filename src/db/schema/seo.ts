import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.ts";
import { media } from "./content.ts";

// Per-route metadata overrides. Null field = no override, pageMeta() falls back
// to the hardcoded value.
export const seoOverrides = pgTable("seo_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  path: text("path").notNull().unique(),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  canonical: text("canonical"),
  ogImageId: uuid("og_image_id").references(() => media.id, { onDelete: "set null" }),
  noindex: boolean("noindex"),
  nofollow: boolean("nofollow"),
  sitemapInclude: boolean("sitemap_include"),
  sitemapChangefreq: text("sitemap_changefreq"),
  sitemapPriority: real("sitemap_priority"),
  // FAQPage JSON-LD on the detail pages that have FAQs: null and true emit
  // it, false suppresses it (the visible FAQ section stays either way).
  faqEnabled: boolean("faq_enabled"),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const redirects = pgTable("redirects", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().unique(),
  destination: text("destination").notNull(),
  // 301 or 302.
  code: integer("code").notNull().default(301),
  enabled: boolean("enabled").notNull().default(true),
  hits: integer("hits").notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  note: text("note").notNull().default(""),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seoAudits = pgTable(
  "seo_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    routesScanned: integer("routes_scanned"),
    // Aggregate counts per finding kind, for run-over-run comparison.
    summary: jsonb("summary"),
    // running | finished | failed
    status: text("status").notNull().default("running"),
    error: text("error"),
    // The origin that was crawled, e.g. https://develmo.com.
    origin: text("origin"),
    startedById: uuid("started_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  // At most one crawl runs at a time, enforced by the database rather than
  // by a check-then-insert.
  (t) => [uniqueIndex("seo_audits_one_running_idx").on(t.status).where(sql`${t.status} = 'running'`)],
);

export const seoAuditFindings = pgTable(
  "seo_audit_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => seoAudits.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    // missing_title | duplicate_title | missing_description | overlength_description |
    // missing_alt | broken_link | orphan_page | missing_canonical | h1_count | ...
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("warning"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("seo_audit_findings_audit_id_idx").on(t.auditId)],
);
