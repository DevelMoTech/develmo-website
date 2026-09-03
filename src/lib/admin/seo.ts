import { and, asc, desc, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { media, redirects, seoAuditFindings, seoAudits, seoOverrides } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { SessionWithUser } from "@/lib/auth/session";
import { clearSetting, getSetting, setSetting, type SitemapState } from "@/lib/admin/settings";
import { scanHtml, type PageScan } from "@/lib/seo/html";
import { buildOrganizationLd, validateOrganizationLd } from "@/lib/seo/organization";
import { SCHEMA_TAG } from "@/lib/seo/organization-server";
import { trustedOrigin } from "@/lib/seo/origin";
import { getSeoOverrides, SEO_TAG, seoPathTag, type SeoOverride } from "@/lib/seo/overrides";
import { normalizePath, REDIRECTS_TAG } from "@/lib/seo/redirect-map";
import { checkRedirectRule, type RuleCheck } from "@/lib/seo/redirect-rules";
import { listPublicRoutes, type PublicRoute } from "@/lib/seo/routes";
import { renderRobots, ROBOTS_TAG, validateRobots } from "@/lib/seo/robots";
import { resolveSitemapRow, SITEMAP_TAG, type SitemapRow } from "@/lib/seo/sitemap";
import { STATIC_REDIRECTS } from "@/lib/seo/static-redirects";
import { FINDING_KINDS, runSeoAudit, type AuditSummary, type FindingKind } from "@/lib/seo/audit";
import type { OrganizationFactsInput, OverrideInput, RedirectInput, SitemapFieldsInput } from "@/lib/schemas/seo";

// Write side of the SEO manager (brief §3.6). Every change is audited and
// busts the matching repo cache tag, so the public site picks it up on the
// next request without a rebuild.

export type Actor = { user: SessionWithUser["user"]; ipHash: string | null };

const bust = (...tags: string[]) => {
  for (const t of tags) revalidateTag(t, { expire: 0 });
};

// ---------- Per-route overrides ----------

export type RouteRow = PublicRoute & { override: SeoOverride | null };

export async function listRoutesWithOverrides(): Promise<RouteRow[]> {
  const [routes, overrides] = await Promise.all([listPublicRoutes(), getSeoOverrides()]);
  const byPath = new Map(overrides.map((o) => [o.path, o]));
  const rows: RouteRow[] = routes.map((r) => ({ ...r, override: byPath.get(r.path) ?? null }));
  // Overrides for paths that no longer exist (a deleted post, a closed job)
  // are still listed so they can be cleared.
  const known = new Set(rows.map((r) => r.path));
  for (const o of overrides) {
    if (known.has(o.path)) continue;
    rows.push({ path: o.path, kind: "static", label: "(route not found)", sitemapDefault: { include: false, changefreq: "monthly", priority: 0.5 }, contentNoindex: false, hasFaq: false, override: o });
  }
  return rows;
}

const unset = (v: unknown) => v === null || v === undefined;

// True when every field is back at its default, in which case the row is
// removed rather than kept full of nulls. noindex and nofollow default to
// off; a false sitemapInclude or faqEnabled is a real override.
function isAllDefault(input: OverrideInput): boolean {
  return unset(input.metaTitle) && unset(input.metaDescription) && unset(input.canonical) && unset(input.ogImageId) && !input.noindex && !input.nofollow && unset(input.sitemapInclude) && unset(input.sitemapChangefreq) && unset(input.sitemapPriority) && input.faqEnabled !== false;
}

export async function saveOverride(input: OverrideInput, actor: Actor): Promise<{ ok: true; cleared: boolean } | { ok: false; error: string }> {
  const db = getDb();
  const path = normalizePath(input.path);
  if (/^\/(admin|api)(\/|$)/.test(path)) return { ok: false, error: "protected_path" };
  if (input.ogImageId) {
    const img = (await db.select({ id: media.id, contentType: media.contentType }).from(media).where(eq(media.id, input.ogImageId)).limit(1))[0];
    if (!img) return { ok: false, error: "image_not_found" };
    if (!img.contentType.startsWith("image/")) return { ok: false, error: "not_an_image" };
  }
  const before = (await db.select().from(seoOverrides).where(eq(seoOverrides.path, path)).limit(1))[0] ?? null;
  const values = {
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    canonical: input.canonical ?? null,
    ogImageId: input.ogImageId ?? null,
    noindex: input.noindex ? true : null,
    nofollow: input.nofollow ? true : null,
    sitemapInclude: input.sitemapInclude ?? null,
    sitemapChangefreq: input.sitemapChangefreq ?? null,
    sitemapPriority: input.sitemapPriority ?? null,
    faqEnabled: input.faqEnabled === false ? false : null,
  };
  const cleared = isAllDefault(input);
  if (cleared) {
    if (before) await db.delete(seoOverrides).where(eq(seoOverrides.path, path));
  } else {
    await db
      .insert(seoOverrides)
      .values({ path, ...values, updatedById: actor.user.id })
      .onConflictDoUpdate({ target: seoOverrides.path, set: { ...values, updatedById: actor.user.id, updatedAt: sql`now()` } });
  }
  if (cleared && !before) return { ok: true, cleared };
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: cleared ? "seo.override.clear" : "seo.override.save", entityType: "seo_override", entityId: path, before, after: cleared ? null : { path, ...values }, ipHash: actor.ipHash });
  bust(SEO_TAG, seoPathTag(path), SITEMAP_TAG);
  return { ok: true, cleared };
}

export async function clearOverride(path: string, actor: Actor): Promise<boolean> {
  const db = getDb();
  const p = normalizePath(path);
  const before = (await db.select().from(seoOverrides).where(eq(seoOverrides.path, p)).limit(1))[0] ?? null;
  if (!before) return false;
  await db.delete(seoOverrides).where(eq(seoOverrides.path, p));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.override.clear", entityType: "seo_override", entityId: p, before, ipHash: actor.ipHash });
  bust(SEO_TAG, seoPathTag(p), SITEMAP_TAG);
  return true;
}

// The sitemap columns only, merged into whatever else the row holds. A row
// left with nothing but defaults is removed.
export async function saveSitemapFields(input: SitemapFieldsInput, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const path = normalizePath(input.path);
  if (/^\/(admin|api)(\/|$)/.test(path)) return { ok: false, error: "protected_path" };
  const before = (await db.select().from(seoOverrides).where(eq(seoOverrides.path, path)).limit(1))[0] ?? null;
  const set = { sitemapInclude: input.sitemapInclude, sitemapChangefreq: input.sitemapChangefreq, sitemapPriority: input.sitemapPriority };
  const merged = { ...(before ?? {}), ...set };
  const empty = unset(merged.metaTitle) && unset(merged.metaDescription) && unset(merged.canonical) && unset(merged.ogImageId) && !merged.noindex && !merged.nofollow && unset(set.sitemapInclude) && unset(set.sitemapChangefreq) && unset(set.sitemapPriority) && merged.faqEnabled !== false;
  if (empty) {
    if (before) await db.delete(seoOverrides).where(eq(seoOverrides.path, path));
  } else {
    await db
      .insert(seoOverrides)
      .values({ path, ...set, updatedById: actor.user.id })
      .onConflictDoUpdate({ target: seoOverrides.path, set: { ...set, updatedById: actor.user.id, updatedAt: sql`now()` } });
  }
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.sitemap.route", entityType: "seo_override", entityId: path, before: before ? { sitemapInclude: before.sitemapInclude, sitemapChangefreq: before.sitemapChangefreq, sitemapPriority: before.sitemapPriority } : null, after: set, ipHash: actor.ipHash });
  bust(SEO_TAG, seoPathTag(path), SITEMAP_TAG);
  return { ok: true };
}

// What the public route serves right now, for the editor's "current values"
// and the SERP preview fallback.
export type CurrentMeta = Pick<PageScan, "title" | "description" | "canonical" | "robots" | "h1s"> & { status: number };

export async function fetchCurrentMeta(baseUrl: string, path: string): Promise<CurrentMeta> {
  const res = await fetch(`${trustedOrigin(baseUrl)}${normalizePath(path)}`, { headers: { accept: "text/html", "user-agent": "DevelMo-SEO-Console/1.0" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return { status: res.status, title: null, description: null, canonical: null, robots: null, h1s: [] };
  const scan = scanHtml(await res.text());
  return { status: res.status, title: scan.title, description: scan.description, canonical: scan.canonical, robots: scan.robots, h1s: scan.h1s };
}

// ---------- Redirects ----------

export type RedirectRow = {
  id: string;
  source: string;
  destination: string;
  code: number;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export async function listRedirects(): Promise<RedirectRow[]> {
  const rows = await getDb().select().from(redirects).orderBy(desc(redirects.updatedAt));
  return rows.map((r) => ({ id: r.id, source: r.source, destination: r.destination, code: r.code, enabled: r.enabled, hits: r.hits, lastHitAt: r.lastHitAt?.toISOString() ?? null, note: r.note, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}

export async function checkRedirect(input: RedirectInput): Promise<RuleCheck> {
  const [existing, routes] = await Promise.all([getDb().select({ id: redirects.id, source: redirects.source, destination: redirects.destination, enabled: redirects.enabled }).from(redirects), listPublicRoutes()]);
  return checkRedirectRule({ id: input.id, source: input.source, destination: input.destination, enabled: input.enabled }, existing, STATIC_REDIRECTS, routes.map((r) => r.path));
}

export async function saveRedirect(input: RedirectInput, actor: Actor): Promise<{ ok: true; id: string; check: RuleCheck } | { ok: false; error: string; check: RuleCheck }> {
  const db = getDb();
  const check = await checkRedirect(input);
  if (check.errors.length) return { ok: false, error: "invalid_rule", check };
  const source = normalizePath(input.source);
  const values = { source, destination: input.destination.trim(), code: input.code, enabled: input.enabled, note: input.note ?? "" };
  if (input.id) {
    const before = (await db.select().from(redirects).where(eq(redirects.id, input.id)).limit(1))[0];
    if (!before) return { ok: false, error: "not_found", check };
    await db.update(redirects).set({ ...values, updatedAt: sql`now()` }).where(eq(redirects.id, input.id));
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "redirect.update", entityType: "redirect", entityId: input.id, before: { source: before.source, destination: before.destination, code: before.code, enabled: before.enabled, note: before.note }, after: values, ipHash: actor.ipHash });
    bust(REDIRECTS_TAG);
    return { ok: true, id: input.id, check };
  }
  const inserted = (await db.insert(redirects).values({ ...values, createdById: actor.user.id }).returning({ id: redirects.id }))[0];
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "redirect.create", entityType: "redirect", entityId: inserted.id, after: values, ipHash: actor.ipHash });
  bust(REDIRECTS_TAG);
  return { ok: true, id: inserted.id, check };
}

export async function setRedirectEnabled(id: string, enabled: boolean, actor: Actor): Promise<boolean> {
  const db = getDb();
  const before = (await db.select().from(redirects).where(eq(redirects.id, id)).limit(1))[0];
  if (!before) return false;
  if (before.enabled === enabled) return true;
  await db.update(redirects).set({ enabled, updatedAt: sql`now()` }).where(eq(redirects.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: enabled ? "redirect.enable" : "redirect.disable", entityType: "redirect", entityId: id, before: { enabled: before.enabled }, after: { enabled }, ipHash: actor.ipHash });
  bust(REDIRECTS_TAG);
  return true;
}

export async function deleteRedirect(id: string, actor: Actor): Promise<boolean> {
  const db = getDb();
  const before = (await db.select().from(redirects).where(eq(redirects.id, id)).limit(1))[0];
  if (!before) return false;
  await db.delete(redirects).where(eq(redirects.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "redirect.delete", entityType: "redirect", entityId: id, before: { source: before.source, destination: before.destination, code: before.code, enabled: before.enabled, hits: before.hits }, ipHash: actor.ipHash });
  bust(REDIRECTS_TAG);
  return true;
}

// ---------- Sitemap ----------

export async function listSitemapRows(): Promise<SitemapRow[]> {
  const [routes, overrides] = await Promise.all([listPublicRoutes(), getSeoOverrides()]);
  const byPath = new Map(overrides.map((o) => [o.path, o]));
  return routes.map((r) => resolveSitemapRow(r, byPath.get(r.path)));
}

export async function getSitemapState(): Promise<SitemapState> {
  return getSetting("sitemap_state");
}

// "Regenerate now" in two steps: bust the cached sitemap inside the request
// (invalidations are applied when the handler finishes), then fetch the
// file after the response so it is rebuilt now, and its generation time
// recorded, rather than on the next crawler visit.
export async function bustSitemap(actor: Actor): Promise<void> {
  bust(SITEMAP_TAG, SEO_TAG);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.sitemap.regenerate", entityType: "sitemap", entityId: "sitemap.xml", ipHash: actor.ipHash });
}

export async function warmSitemap(baseUrl: string): Promise<{ urls: number; status: number }> {
  try {
    const res = await fetch(`${trustedOrigin(baseUrl)}/sitemap.xml`, { cache: "no-store", headers: { "user-agent": "DevelMo-SEO-Console/1.0", "x-seo-regenerate": "1" }, signal: AbortSignal.timeout(20_000) });
    const xml = res.ok ? await res.text() : "";
    return { urls: (xml.match(/<loc>/g) ?? []).length, status: res.status };
  } catch (err) {
    console.error("[seo] sitemap warm-up failed:", err instanceof Error ? err.message : err);
    return { urls: 0, status: 0 };
  }
}

// ---------- robots.txt ----------

export async function getRobots(): Promise<{ body: string; rendered: string }> {
  const { body } = await getSetting("robots");
  return { body, rendered: renderRobots(body) };
}

export async function saveRobots(body: string, actor: Actor): Promise<{ ok: true; rendered: string; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] }> {
  const report = validateRobots(body);
  if (report.errors.length) return { ok: false, errors: report.errors, warnings: report.warnings };
  const before = await getSetting("robots");
  await setSetting("robots", { body }, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.robots.save", entityType: "settings", entityId: "robots", before, after: { body }, ipHash: actor.ipHash });
  bust(ROBOTS_TAG);
  return { ok: true, rendered: renderRobots(body), warnings: report.warnings };
}

export async function resetRobots(actor: Actor): Promise<void> {
  const before = await getSetting("robots");
  await clearSetting("robots");
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.robots.reset", entityType: "settings", entityId: "robots", before, ipHash: actor.ipHash });
  bust(ROBOTS_TAG);
}

// ---------- Structured data ----------

export async function saveOrganizationFacts(facts: OrganizationFactsInput, actor: Actor): Promise<{ ok: true; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] }> {
  const ld = buildOrganizationLd(facts);
  const report = validateOrganizationLd(ld);
  if (report.errors.length) return { ok: false, errors: report.errors, warnings: report.warnings };
  const before = await getSetting("org_schema");
  await setSetting("org_schema", facts, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.schema.save", entityType: "settings", entityId: "org_schema", before, after: facts, ipHash: actor.ipHash });
  bust(SCHEMA_TAG);
  return { ok: true, warnings: report.warnings };
}

export async function resetOrganizationFacts(actor: Actor): Promise<void> {
  const before = await getSetting("org_schema");
  await clearSetting("org_schema");
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.schema.reset", entityType: "settings", entityId: "org_schema", before, ipHash: actor.ipHash });
  bust(SCHEMA_TAG);
}

export async function setFaqEnabled(path: string, enabled: boolean, actor: Actor): Promise<void> {
  const db = getDb();
  const p = normalizePath(path);
  const row = (await db.select().from(seoOverrides).where(eq(seoOverrides.path, p)).limit(1))[0] ?? null;
  const before = row ? { faqEnabled: row.faqEnabled } : null;
  const otherFields = row ? !(unset(row.metaTitle) && unset(row.metaDescription) && unset(row.canonical) && unset(row.ogImageId) && !row.noindex && !row.nofollow && unset(row.sitemapInclude) && unset(row.sitemapChangefreq) && unset(row.sitemapPriority)) : false;
  if (enabled && !otherFields) {
    // Back to the default with nothing else on the row: no row at all.
    if (row) await db.delete(seoOverrides).where(eq(seoOverrides.path, p));
  } else {
    await db
      .insert(seoOverrides)
      .values({ path: p, faqEnabled: enabled ? null : false, updatedById: actor.user.id })
      .onConflictDoUpdate({ target: seoOverrides.path, set: { faqEnabled: enabled ? null : false, updatedById: actor.user.id, updatedAt: sql`now()` } });
  }
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.faq.toggle", entityType: "seo_override", entityId: p, before, after: { faqEnabled: enabled }, ipHash: actor.ipHash });
  bust(SEO_TAG, seoPathTag(p));
}

// ---------- Audit runs ----------

export type AuditRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  error: string | null;
  origin: string | null;
  routesScanned: number | null;
  summary: AuditSummary | null;
};

function toRun(r: typeof seoAudits.$inferSelect): AuditRun {
  return { id: r.id, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, status: r.status, error: r.error, origin: r.origin, routesScanned: r.routesScanned, summary: (r.summary as AuditSummary | null) ?? null };
}

const STALE_RUN_MS = 10 * 60 * 1000;

// A run that never finished (a cut-off function) is marked failed after ten
// minutes, whenever runs are read or a new one is started.
async function expireStaleRuns(): Promise<void> {
  await getDb()
    .update(seoAudits)
    .set({ status: "failed", finishedAt: sql`now()`, error: "Did not finish within 10 minutes" })
    .where(and(eq(seoAudits.status, "running"), sql`${seoAudits.startedAt} < ${new Date(Date.now() - STALE_RUN_MS)}`));
}

export async function startAudit(baseUrl: string, actor: Actor): Promise<{ id: string; origin: string } | { error: "already_running" }> {
  const db = getDb();
  const origin = trustedOrigin(baseUrl);
  await expireStaleRuns();
  const running = (await db.select({ id: seoAudits.id }).from(seoAudits).where(eq(seoAudits.status, "running")).limit(1))[0];
  if (running) return { error: "already_running" };
  // A partial unique index (one row with status running) closes the gap
  // between the check and the insert when two people click at once.
  let inserted: { id: string };
  try {
    inserted = (await db.insert(seoAudits).values({ origin, startedById: actor.user.id }).returning({ id: seoAudits.id }))[0];
  } catch (err) {
    const code = err && typeof err === "object" ? ((err as { code?: string }).code ?? ((err as { cause?: { code?: string } }).cause?.code)) : undefined;
    if (code === "23505") return { error: "already_running" };
    throw err;
  }
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "seo.audit.run", entityType: "seo_audit", entityId: inserted.id, after: { origin }, ipHash: actor.ipHash });
  return { id: inserted.id, origin };
}

export { runSeoAudit };

export async function listAudits(limit = 30): Promise<AuditRun[]> {
  await expireStaleRuns();
  const rows = await getDb().select().from(seoAudits).orderBy(desc(seoAudits.startedAt)).limit(limit);
  return rows.map(toRun);
}

export async function loadAudit(id: string): Promise<AuditRun | null> {
  await expireStaleRuns();
  const row = (await getDb().select().from(seoAudits).where(eq(seoAudits.id, id)).limit(1))[0];
  return row ? toRun(row) : null;
}

export type FindingRow = { id: string; path: string; kind: FindingKind; severity: string; detail: Record<string, unknown> };

export async function loadFindings(auditId: string): Promise<FindingRow[]> {
  const rows = await getDb().select().from(seoAuditFindings).where(eq(seoAuditFindings.auditId, auditId)).orderBy(asc(seoAuditFindings.kind), asc(seoAuditFindings.path));
  return rows.map((r) => ({ id: r.id, path: r.path, kind: r.kind as FindingKind, severity: r.severity, detail: (r.detail as Record<string, unknown>) ?? {} }));
}

// The previous finished run before this one, for the comparison view.
export async function previousAudit(run: AuditRun): Promise<AuditRun | null> {
  const row = (await getDb().select().from(seoAudits).where(and(eq(seoAudits.status, "finished"), sql`${seoAudits.startedAt} < ${new Date(run.startedAt)}`)).orderBy(desc(seoAudits.startedAt)).limit(1))[0];
  return row ? toRun(row) : null;
}

export function findingKey(f: { path: string; kind: string; detail: Record<string, unknown> }): string {
  const d = f.detail;
  const extra = f.kind === "broken_link" ? String(d.target ?? "") : f.kind === "duplicate_title" ? String(d.title ?? "") : "";
  return `${f.kind}|${f.path}|${extra}`;
}

export function compareFindings(current: FindingRow[], previous: FindingRow[]): { added: FindingRow[]; fixed: FindingRow[]; unchanged: number } {
  const prev = new Map(previous.map((f) => [findingKey(f), f]));
  const cur = new Map(current.map((f) => [findingKey(f), f]));
  const added = current.filter((f) => !prev.has(findingKey(f)));
  const fixed = previous.filter((f) => !cur.has(findingKey(f)));
  return { added, fixed, unchanged: current.length - added.length };
}

export const KINDS = FINDING_KINDS;
