import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { count, desc, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { auditLog, buildStats as buildStatsTable, media, psiSnapshots, webVitals } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import type { SessionWithUser } from "@/lib/auth/session";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { compareBuilds, type BuildDelta, type BuildStats } from "@/lib/perf/bundle";
import { contentTypeOf, kindOf, type AssetRow } from "@/lib/perf/assets";
import { METRICS, THRESHOLDS, type DeviceClass, type MetricName } from "@/lib/perf/vitals";
import { runPsi, type PsiSnapshot } from "@/lib/perf/psi";
import { trustedOrigin } from "@/lib/seo/origin";
import type { CacheTag, MediaSettings, PsiStrategy, RevalidatePathInput } from "@/lib/schemas/performance";
import { CACHE_TAGS } from "@/lib/schemas/performance";

// Read and write side of the performance manager (brief §3.8). Reads need
// performance:read, changes need performance:write; both are enforced by
// the callers. Every change writes an audit row.

export type Actor = { user: SessionWithUser["user"]; ipHash: string | null };

// ---------- Core Web Vitals ----------

export type VitalsCell = { p75: number | null; samples: number };
export type VitalsRouteRow = {
  route: string;
  // metric -> device class -> value
  metrics: Record<MetricName, Record<DeviceClass, VitalsCell>>;
  samples: number;
};

const emptyCell = (): VitalsCell => ({ p75: null, samples: 0 });

function emptyMetrics(): Record<MetricName, Record<DeviceClass, VitalsCell>> {
  const out = {} as Record<MetricName, Record<DeviceClass, VitalsCell>>;
  for (const m of METRICS) out[m] = { mobile: emptyCell(), desktop: emptyCell() };
  return out;
}

// p75 per route per metric per device class, over a window. Postgres does
// the percentile so the whole table never has to be read into the app.
export async function vitalsByRoute(days: number): Promise<VitalsRouteRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({
      route: webVitals.route,
      metric: webVitals.metric,
      deviceClass: webVitals.deviceClass,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${webVitals.value})`,
      samples: count(),
    })
    .from(webVitals)
    .where(gte(webVitals.createdAt, since))
    .groupBy(webVitals.route, webVitals.metric, webVitals.deviceClass);

  const byRoute = new Map<string, VitalsRouteRow>();
  for (const r of rows) {
    const metric = r.metric as MetricName;
    if (!(METRICS as readonly string[]).includes(metric)) continue;
    const device = (r.deviceClass === "mobile" ? "mobile" : "desktop") as DeviceClass;
    const entry = byRoute.get(r.route) ?? { route: r.route, metrics: emptyMetrics(), samples: 0 };
    entry.metrics[metric][device] = { p75: r.p75 === null ? null : Number(r.p75), samples: Number(r.samples) };
    entry.samples += Number(r.samples);
    byRoute.set(r.route, entry);
  }
  return [...byRoute.values()].sort((a, b) => b.samples - a.samples || a.route.localeCompare(b.route));
}

export type VitalsSummary = { days: number; samples: number; routes: number; worst: { metric: MetricName; route: string; p75: number } | null };

export async function vitalsSummary(days: number): Promise<VitalsSummary> {
  const rows = await vitalsByRoute(days);
  let worst: VitalsSummary["worst"] = null;
  for (const r of rows) {
    for (const m of METRICS) {
      for (const d of ["mobile", "desktop"] as const) {
        const cell = r.metrics[m][d];
        if (cell.p75 === null) continue;
        // "Worst" means furthest past its own good threshold, so metrics on
        // different scales stay comparable.
        const ratio = cell.p75 / THRESHOLDS[m].good;
        if (!worst || ratio > worst.p75 / THRESHOLDS[worst.metric].good) worst = { metric: m, route: r.route, p75: cell.p75 };
      }
    }
  }
  return { days, samples: rows.reduce((n, r) => n + r.samples, 0), routes: rows.length, worst };
}

// ---------- PageSpeed Insights ----------

export type PsiRow = {
  id: string;
  route: string;
  strategy: PsiStrategy;
  runAt: string;
  scores: Record<string, number | null> | null;
  opportunities: PsiSnapshot["opportunities"] | null;
};

export async function listPsiRuns(limit = 40): Promise<PsiRow[]> {
  const rows = await getDb().select().from(psiSnapshots).orderBy(desc(psiSnapshots.runAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    route: r.route,
    strategy: (r.strategy === "desktop" ? "desktop" : "mobile") as PsiStrategy,
    runAt: r.runAt.toISOString(),
    scores: (r.scores as Record<string, number | null> | null) ?? null,
    opportunities: (r.opportunities as PsiSnapshot["opportunities"] | null) ?? null,
  }));
}

export async function recordPsiRun(baseUrl: string, input: { path: string; strategy: PsiStrategy }, actor: Actor): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const origin = trustedOrigin(baseUrl);
  const url = `${origin}${input.path}`;
  const result = await runPsi(url, input.strategy);
  if (!result.ok) return { ok: false, error: result.error };
  const inserted = (
    await getDb()
      .insert(psiSnapshots)
      .values({ route: input.path, strategy: input.strategy, scores: result.snapshot.scores, opportunities: result.snapshot.opportunities })
      .returning({ id: psiSnapshots.id })
  )[0];
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "performance.psi.run", entityType: "psi_snapshot", entityId: inserted.id, after: { route: input.path, strategy: input.strategy, scores: result.snapshot.scores }, ipHash: actor.ipHash });
  return { ok: true, id: inserted.id };
}

// ---------- Assets ----------

type BuildStatsFile = BuildStats & { assetRefs?: Record<string, string[]> };

const distDir = () => process.env.NEXT_DIST_DIR ?? ".next";

async function readBuildStatsFile(): Promise<BuildStatsFile | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), distDir(), "build-stats.json"), "utf8")) as BuildStatsFile;
  } catch {
    return null;
  }
}

async function walkPublic(dir: string, base: string, out: { path: string; bytes: number }[] = []): Promise<{ path: string; bytes: number }[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkPublic(full, base, out);
    else out.push({ path: `/${path.relative(base, full).split(path.sep).join("/")}`, bytes: (await stat(full)).size });
  }
  return out;
}

// The real bytes a visitor receives, from the live response, including any
// compression the platform applies. Videos and images are already
// compressed so this usually matches the file size; text assets do not.
async function measureTransfer(origin: string, assetPath: string): Promise<{ bytes: number | null; encoding: string | null }> {
  try {
    const res = await fetch(`${origin}${assetPath}`, {
      method: "GET",
      headers: { "accept-encoding": "gzip, br", range: "bytes=0-0", "user-agent": "DevelMo-Performance-Console/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    await res.arrayBuffer().catch(() => undefined);
    const encoding = res.headers.get("content-encoding");
    // A range response reports the full size in content-range.
    const range = res.headers.get("content-range");
    const fromRange = range ? Number(range.split("/")[1]) : NaN;
    if (Number.isFinite(fromRange)) return { bytes: fromRange, encoding };
    const length = Number(res.headers.get("content-length"));
    return { bytes: Number.isFinite(length) ? length : null, encoding };
  } catch {
    return { bytes: null, encoding: null };
  }
}

export async function assetReport(baseUrl: string): Promise<{ rows: AssetRow[]; measured: boolean; note: string | null }> {
  const origin = trustedOrigin(baseUrl);
  const publicDir = path.join(process.cwd(), "public");
  const files = await walkPublic(publicDir, publicDir);
  const stats = await readBuildStatsFile();
  const refs = stats?.assetRefs ?? {};

  const rows: AssetRow[] = [];
  for (const f of files) {
    rows.push({
      path: f.path,
      kind: kindOf(f.path),
      contentType: contentTypeOf(f.path),
      bytes: f.bytes,
      transferBytes: null,
      encoding: null,
      routes: refs[f.path] ?? [],
      source: "public",
    });
  }

  // Media uploaded through the library, which is served from Blob in
  // production and from disk locally.
  const uploaded = await getDb().select({ url: media.url, filename: media.filename, contentType: media.contentType, size: media.size }).from(media).orderBy(desc(media.size)).limit(200);
  for (const m of uploaded) {
    rows.push({
      path: m.url,
      kind: kindOf(m.filename),
      contentType: m.contentType,
      bytes: m.size,
      transferBytes: null,
      encoding: null,
      routes: [],
      source: "blob",
    });
  }

  // Measuring every asset would be a lot of requests; the heaviest ones are
  // the ones the report is about.
  const toMeasure = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 20);
  const measurements = await Promise.all(toMeasure.map((r) => (r.source === "public" ? measureTransfer(origin, r.path) : Promise.resolve({ bytes: null, encoding: null }))));
  toMeasure.forEach((r, i) => {
    r.transferBytes = measurements[i].bytes;
    r.encoding = measurements[i].encoding;
  });

  rows.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  return {
    rows,
    measured: measurements.some((m) => m.bytes !== null),
    note: files.length === 0 ? "public/ could not be read from this deployment, so only uploaded media is listed." : stats ? null : "Reference data comes from the build; run a build to populate which source files use each asset.",
  };
}

// ---------- Build and bundle stats ----------

export type BuildRow = { id: string; recordedAt: string; buildId: string | null; stats: BuildStats };

// The whole snapshot is stored in the routes column; chunks is kept
// alongside it so a query can read the heavy list without the rest.
export async function listBuildStats(limit = 10): Promise<BuildRow[]> {
  const rows = await getDb().select().from(buildStatsTable).orderBy(desc(buildStatsTable.recordedAt)).limit(limit);
  return rows.map((r) => {
    const stored = (r.routes as Partial<BuildStats> | null) ?? {};
    return {
      id: r.id,
      recordedAt: r.recordedAt.toISOString(),
      buildId: r.buildId,
      stats: {
        buildId: stored.buildId ?? r.buildId,
        recordedAt: stored.recordedAt ?? r.recordedAt.toISOString(),
        sharedBytes: stored.sharedBytes ?? 0,
        totalClientBytes: stored.totalClientBytes ?? 0,
        routes: stored.routes ?? [],
        chunks: stored.chunks ?? ((r.chunks as BuildStats["chunks"] | null) ?? []),
      },
    };
  });
}

export type BuildView = { current: BuildStats | null; previous: BuildStats | null; delta: BuildDelta | null; fromFile: BuildStats | null; recordedAt: string | null };

export async function buildView(): Promise<BuildView> {
  const [recorded, file] = await Promise.all([listBuildStats(2), readBuildStatsFile()]);
  const current = recorded[0]?.stats ?? null;
  const previous = recorded[1]?.stats ?? null;
  return {
    current,
    previous,
    delta: current ? compareBuilds(previous, current) : null,
    fromFile: file,
    recordedAt: recorded[0]?.recordedAt ?? null,
  };
}

// Stores the build's own stats file as a snapshot, so the next build has
// something to be compared against.
export async function recordBuildStats(actor: Actor): Promise<{ ok: true; routes: number; buildId: string | null } | { ok: false; error: string }> {
  const file = await readBuildStatsFile();
  if (!file) return { ok: false, error: `No ${distDir()}/build-stats.json. It is written by the postbuild script after every build; this deployment may not carry it.` };
  const latest = (await getDb().select({ buildId: buildStatsTable.buildId }).from(buildStatsTable).orderBy(desc(buildStatsTable.recordedAt)).limit(1))[0];
  if (latest && file.buildId && latest.buildId === file.buildId) return { ok: false, error: "This build is already recorded; there is nothing new to compare." };
  const { assetRefs, ...stats } = file;
  void assetRefs;
  await getDb().insert(buildStatsTable).values({ buildId: file.buildId, routes: stats, chunks: stats.chunks });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "performance.build.record", entityType: "build_stats", entityId: file.buildId ?? "unknown", after: { routes: stats.routes.length, sharedBytes: stats.sharedBytes, totalClientBytes: stats.totalClientBytes }, ipHash: actor.ipHash });
  return { ok: true, routes: stats.routes.length, buildId: file.buildId };
}

// ---------- Cache ----------

// Which audit actions bust which tag, so "last revalidation" is a real
// timestamp from the trail rather than a number this page invents.
const TAG_ACTIONS: Record<CacheTag, string[]> = {
  content: ["content.update", "content.reorder", "translation.update"],
  services: ["content.update"],
  industries: ["content.update"],
  products: ["content.update"],
  about: ["content.update"],
  posts: ["post.publish", "post.unpublish", "post.update", "post.schedule", "post.archive", "post.delete", "post.restore"],
  jobs: ["job.publish", "job.update", "job.close", "job.delete", "job.create"],
  seo: ["seo.override.save", "seo.override.clear", "seo.sitemap.route"],
  sitemap: ["seo.sitemap.regenerate", "seo.override.save", "seo.override.clear", "seo.sitemap.route"],
  robots: ["seo.robots.save", "seo.robots.reset"],
  redirects: ["redirect.create", "redirect.update", "redirect.delete", "redirect.enable", "redirect.disable"],
  schema: ["seo.schema.save", "seo.schema.reset"],
  "ip-rules": ["security.ip_rule.block", "security.ip_rule.allow", "security.ip_rule.update", "security.ip_rule.delete", "security.ip_rule.expire"],
  turnstile: ["security.turnstile.update"],
  media: ["media.upload", "media.update", "media.delete", "media.replace"],
};

export type CacheTagRow = { tag: CacheTag; lastRevalidatedAt: string | null; lastAction: string | null; lastActor: string | null; description: string };

const TAG_DESCRIPTION: Record<CacheTag, string> = {
  content: "Services, industries, products and the about page content.",
  services: "The service pillars and their detail pages.",
  industries: "The industry list and detail pages.",
  products: "The product list and detail pages.",
  about: "The about page content.",
  posts: "Blog posts and knowledge base articles.",
  jobs: "Job postings and the careers list.",
  seo: "Per route metadata overrides.",
  sitemap: "sitemap.xml.",
  robots: "robots.txt.",
  redirects: "The redirect map the proxy serves.",
  schema: "The Organization JSON-LD on every public page.",
  "ip-rules": "The IP access rules the proxy enforces.",
  turnstile: "The Turnstile toggle and site key.",
  media: "The media library listing.",
};

export async function cacheTagRows(): Promise<CacheTagRow[]> {
  const all = Object.values(TAG_ACTIONS).flat();
  const rows = await getDb()
    .select({ action: auditLog.action, createdAt: auditLog.createdAt, email: auditLog.actorEmail, entityId: auditLog.entityId })
    .from(auditLog)
    .where(inArray(auditLog.action, [...new Set([...all, "performance.revalidate.tag"])]))
    .orderBy(desc(auditLog.createdAt))
    .limit(500);

  return CACHE_TAGS.map((tag) => {
    const actions = new Set(TAG_ACTIONS[tag]);
    const hit = rows.find((r) => actions.has(r.action) || (r.action === "performance.revalidate.tag" && r.entityId === tag));
    return {
      tag,
      lastRevalidatedAt: hit?.createdAt.toISOString() ?? null,
      lastAction: hit?.action ?? null,
      lastActor: hit?.email ?? null,
      description: TAG_DESCRIPTION[tag],
    };
  });
}

export async function revalidateTagNow(tag: CacheTag, actor: Actor): Promise<void> {
  revalidateTag(tag, { expire: 0 });
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "performance.revalidate.tag", entityType: "cache", entityId: tag, after: { tag }, ipHash: actor.ipHash });
}

export async function revalidatePathNow(input: RevalidatePathInput, actor: Actor): Promise<void> {
  revalidatePath(input.path, input.type);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "performance.revalidate.path", entityType: "cache", entityId: input.path, after: { path: input.path, type: input.type }, ipHash: actor.ipHash });
}

// ---------- Media settings ----------

export async function getMediaSettings(): Promise<MediaSettings> {
  return getSetting("media");
}

export async function saveMediaSettings(value: MediaSettings, actor: Actor): Promise<void> {
  const before = await getSetting("media");
  await setSetting("media", value, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "performance.media.update", entityType: "settings", entityId: "media", before, after: value, ipHash: actor.ipHash });
  revalidateTag("media-settings", { expire: 0 });
}

// ---------- Overview ----------

export async function performanceOverview(): Promise<{ vitals7: VitalsSummary; vitals28: VitalsSummary; psiRuns: number; lastPsi: string | null; builds: number }> {
  const db = getDb();
  const [v7, v28, psiCount, lastPsi, builds] = await Promise.all([
    vitalsSummary(7),
    vitalsSummary(28),
    db.select({ n: count() }).from(psiSnapshots),
    db.select({ runAt: psiSnapshots.runAt }).from(psiSnapshots).orderBy(desc(psiSnapshots.runAt)).limit(1),
    db.select({ n: count() }).from(buildStatsTable),
  ]);
  return {
    vitals7: v7,
    vitals28: v28,
    psiRuns: Number(psiCount[0]?.n ?? 0),
    lastPsi: lastPsi[0]?.runAt.toISOString() ?? null,
    builds: Number(builds[0]?.n ?? 0),
  };
}

// Kept for the callers that only need the count of rows behind a window.
export async function vitalsSampleCount(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await getDb().select({ n: count() }).from(webVitals).where(gte(webVitals.createdAt, since));
  return Number(rows[0]?.n ?? 0);
}
