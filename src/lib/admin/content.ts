import { asc, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { contentEntries } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { SessionWithUser } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { listPublicRoutes } from "@/lib/seo/routes";
import { aboutContent as fileAbout } from "@/lib/about";
import { industries as fileIndustries } from "@/lib/industries";
import { products as fileProducts } from "@/lib/products";
import { pillars as filePillars, services as fileServices } from "@/lib/services";
import { site as fileSite, stats as fileStats, tech as fileTech } from "@/lib/site";
import {
  aboutSchema,
  industrySchema,
  navigationSchema,
  pillarSchema,
  productSchema,
  serviceSchema,
  siteFactsSchema,
  statsSchema,
  techSchema,
  type ContentEntity,
  type NavigationInput,
} from "@/lib/schemas/content";

// Site content editing (brief §3.9). Every entity is stored as one jsonb row
// in content_entries, which the repo layer already reads with the typed file
// as its fallback. The schemas mirror the file types exactly, so the optional
// shapes survive a round trip and the FAQPage JSON-LD keeps emitting.

export type Actor = { user: SessionWithUser["user"]; ipHash: string | null };

const bust = (...tags: string[]) => {
  for (const t of tags) revalidateTag(t, { expire: 0 });
};

// Which cache tag each entity lives behind, matching src/lib/repo.
const ENTITY_TAG: Record<string, string> = {
  pillar: "services",
  service: "services",
  industry: "industries",
  product: "products",
  about: "about",
  site: "content",
  stats: "content",
  tech: "content",
};

const SCHEMAS = {
  pillar: pillarSchema,
  service: serviceSchema,
  industry: industrySchema,
  product: productSchema,
  about: aboutSchema,
} as const;

// The typed file, used when the table has not been seeded for an entity.
function fileRows(entity: ContentEntity): { key: string; data: unknown }[] {
  switch (entity) {
    case "pillar":
      return filePillars.map((p) => ({ key: p.key, data: p }));
    case "service":
      return fileServices.map((s) => ({ key: s.slug, data: s }));
    case "industry":
      return fileIndustries.map((i) => ({ key: i.slug, data: i }));
    case "product":
      return fileProducts.map((p) => ({ key: p.slug, data: p }));
    case "about":
      return Object.entries(fileAbout).map(([key, data]) => ({ key, data }));
  }
}

export type EntryRow = { key: string; data: Record<string, unknown>; sortOrder: number; updatedAt: string | null; fromFile: boolean };

export async function listEntries(entity: ContentEntity): Promise<EntryRow[]> {
  const rows = await getDb()
    .select({ key: contentEntries.key, data: contentEntries.data, sortOrder: contentEntries.sortOrder, updatedAt: contentEntries.updatedAt })
    .from(contentEntries)
    .where(eq(contentEntries.entity, entity))
    .orderBy(asc(contentEntries.sortOrder));
  if (rows.length > 0) {
    return rows.map((r) => ({ key: r.key, data: r.data as Record<string, unknown>, sortOrder: r.sortOrder, updatedAt: r.updatedAt.toISOString(), fromFile: false }));
  }
  // Not seeded: show the file so the editor is never blank, and say so.
  return fileRows(entity).map((r, i) => ({ key: r.key, data: r.data as Record<string, unknown>, sortOrder: i, updatedAt: null, fromFile: true }));
}

export async function getEntry(entity: ContentEntity, key: string): Promise<EntryRow | null> {
  return (await listEntries(entity)).find((r) => r.key === key) ?? null;
}

export type SaveResult = { ok: true } | { ok: false; issues: { path: string; message: string }[] };

// Validates against the schema that mirrors the file type, then writes. A
// value that does not fit the shape is refused rather than stored, because a
// malformed row would break the detail page that renders it.
export async function saveEntry(entity: ContentEntity, key: string, data: unknown, actor: Actor): Promise<SaveResult> {
  const parsed = SCHEMAS[entity].safeParse(data);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  const db = getDb();
  const before = (await db.select().from(contentEntries).where(sql`${contentEntries.entity} = ${entity} and ${contentEntries.key} = ${key}`).limit(1))[0] ?? null;
  // A new row goes to the end of the existing order.
  const maxOrder = before
    ? before.sortOrder
    : ((await db.select({ n: sql<number>`coalesce(max(${contentEntries.sortOrder}), -1)` }).from(contentEntries).where(eq(contentEntries.entity, entity)))[0]?.n ?? -1) + 1;

  await db
    .insert(contentEntries)
    .values({ entity, key, data: parsed.data, sortOrder: Number(maxOrder), updatedById: actor.user.id })
    .onConflictDoUpdate({ target: [contentEntries.entity, contentEntries.key], set: { data: parsed.data, updatedById: actor.user.id, updatedAt: sql`now()` } });

  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: `content.${entity}.save`, entityType: "content_entry", entityId: `${entity}:${key}`, before: before?.data ?? null, after: parsed.data, ipHash: actor.ipHash });
  bust("content", ENTITY_TAG[entity] ?? "content");
  return { ok: true };
}

// ---------- Singletons: site facts, stats, tech ----------

async function readSingleton<T>(entity: string, key: string, fallback: T): Promise<{ value: T; fromFile: boolean }> {
  const row = (await getDb().select({ data: contentEntries.data }).from(contentEntries).where(sql`${contentEntries.entity} = ${entity} and ${contentEntries.key} = ${key}`).limit(1))[0];
  return row ? { value: row.data as T, fromFile: false } : { value: fallback, fromFile: true };
}

export async function getSiteFacts() {
  // `nav` is edited on the navigation page, so it is dropped from this form
  // and preserved untouched on write.
  const { value, fromFile } = await readSingleton("site", "site", fileSite as unknown as Record<string, unknown>);
  const { nav, ...facts } = value as Record<string, unknown> & { nav?: unknown };
  return { facts: facts as Record<string, unknown>, nav, fromFile };
}

export async function getStats() {
  return readSingleton("stats", "stats", fileStats as unknown as { value: string; label: string }[]);
}

export async function getTech() {
  return readSingleton("tech", "tech", fileTech as unknown as string[]);
}

async function writeSingleton(entity: string, key: string, data: unknown, actor: Actor, action: string): Promise<void> {
  const db = getDb();
  const before = (await db.select({ data: contentEntries.data }).from(contentEntries).where(sql`${contentEntries.entity} = ${entity} and ${contentEntries.key} = ${key}`).limit(1))[0] ?? null;
  await db
    .insert(contentEntries)
    .values({ entity, key, data, sortOrder: 0, updatedById: actor.user.id })
    .onConflictDoUpdate({ target: [contentEntries.entity, contentEntries.key], set: { data, updatedById: actor.user.id, updatedAt: sql`now()` } });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action, entityType: "content_entry", entityId: `${entity}:${key}`, before: before?.data ?? null, after: data, ipHash: actor.ipHash });
  bust("content", "services", "industries", "products", "about");
}

export async function saveSiteFacts(input: unknown, actor: Actor): Promise<SaveResult> {
  const parsed = siteFactsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  // The navigation array lives on the same row; keep whatever is there.
  const { nav } = await getSiteFacts();
  await writeSingleton("site", "site", { ...parsed.data, nav: nav ?? fileSite.nav }, actor, "content.site.save");
  return { ok: true };
}

export async function saveStats(input: unknown, actor: Actor): Promise<SaveResult> {
  const parsed = statsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  await writeSingleton("stats", "stats", parsed.data, actor, "content.stats.save");
  return { ok: true };
}

export async function saveTech(input: unknown, actor: Actor): Promise<SaveResult> {
  const parsed = techSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  await writeSingleton("tech", "tech", parsed.data, actor, "content.tech.save");
  return { ok: true };
}

// ---------- Navigation ----------

export const NAVIGATION_TAG = "navigation";

export async function getNavigation(): Promise<NavigationInput> {
  return getSetting("navigation");
}

export type DeadLink = { list: "primary" | "company"; index: number; label: string; href: string };

// The guard the brief asks for: a menu is refused if any link points at a
// route that does not resolve. Absolute and mailto links are outside this
// site, so they are accepted as typed; every site path must be a real route.
// The public menu carries exactly one link into the console. It is a real
// page, but not a public route, so listPublicRoutes never contains it. Any
// other /admin path in a public menu is still refused.
const CONSOLE_SIGN_IN = "/admin/login";

export async function findDeadLinks(nav: NavigationInput): Promise<DeadLink[]> {
  const routes = new Set((await listPublicRoutes()).map((r) => r.path));
  const dead: DeadLink[] = [];
  for (const list of ["primary", "company"] as const) {
    nav[list].forEach((link, index) => {
      if (/^(https?:\/\/|mailto:)/i.test(link.href)) return;
      const path = link.href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
      if (path === CONSOLE_SIGN_IN) return;
      if (!routes.has(path)) dead.push({ list, index, label: link.label, href: link.href });
    });
  }
  return dead;
}

export type NavSaveResult = { ok: true } | { ok: false; error: "invalid"; issues: { path: string; message: string }[] } | { ok: false; error: "dead_links"; dead: DeadLink[] };

export async function saveNavigation(input: unknown, actor: Actor): Promise<NavSaveResult> {
  const parsed = navigationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  const dead = await findDeadLinks(parsed.data);
  if (dead.length > 0) return { ok: false, error: "dead_links", dead };
  const before = await getNavigation();
  await setSetting("navigation", parsed.data, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "content.navigation.save", entityType: "settings", entityId: "navigation", before, after: parsed.data, ipHash: actor.ipHash });
  bust(NAVIGATION_TAG, "content");
  return { ok: true };
}

// Every public route, for the editor's link picker and the guard's message.
export async function publicRoutePaths(): Promise<string[]> {
  return (await listPublicRoutes()).map((r) => r.path).sort();
}

// ---------- Overview ----------

export async function contentCounts(): Promise<Record<string, { rows: number; fromFile: boolean }>> {
  const rows = await getDb().select({ entity: contentEntries.entity, n: sql<number>`count(*)` }).from(contentEntries).groupBy(contentEntries.entity);
  const byEntity = new Map(rows.map((r) => [r.entity, Number(r.n)]));
  const out: Record<string, { rows: number; fromFile: boolean }> = {};
  for (const entity of ["pillar", "service", "industry", "product", "about"] as const) {
    const n = byEntity.get(entity) ?? 0;
    out[entity] = { rows: n || fileRows(entity).length, fromFile: n === 0 };
  }
  return out;
}

export async function deleteEntries(entity: ContentEntity, keys: string[], actor: Actor): Promise<number> {
  if (keys.length === 0) return 0;
  const db = getDb();
  const removed = await db
    .delete(contentEntries)
    .where(sql`${contentEntries.entity} = ${entity} and ${inArray(contentEntries.key, keys)}`)
    .returning({ key: contentEntries.key });
  if (removed.length) {
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: `content.${entity}.delete`, entityType: "content_entry", entityId: entity, before: { keys: removed.map((r) => r.key) }, ipHash: actor.ipHash });
    bust("content", ENTITY_TAG[entity] ?? "content");
  }
  return removed.length;
}
