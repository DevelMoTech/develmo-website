import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { seoAuditFindings, seoAudits } from "@/db/schema";
import { internalPath, scanHtml, type PageScan } from "./html";
import { listPublicRoutes } from "./routes";
import { DESCRIPTION_LIMIT } from "@/lib/schemas/seo";

// The on-demand crawl (brief §3.6): starts at / and follows internal links,
// then visits every registry route the crawl did not reach (those are the
// orphans), and stores one finding per problem so runs can be compared.

export const FINDING_KINDS = [
  "missing_title",
  "duplicate_title",
  "missing_description",
  "overlength_description",
  "missing_alt",
  "broken_link",
  "orphan_page",
  "missing_canonical",
  "canonical_mismatch",
  "h1_count",
  "fetch_error",
  "redirected",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_LABELS: Record<FindingKind, string> = {
  missing_title: "Missing title",
  duplicate_title: "Duplicate title",
  missing_description: "Missing description",
  overlength_description: "Description too long",
  missing_alt: "Image without alt text",
  broken_link: "Broken internal link",
  orphan_page: "Orphan page",
  missing_canonical: "Missing canonical",
  canonical_mismatch: "Canonical points elsewhere",
  h1_count: "H1 count",
  fetch_error: "Page did not load",
  redirected: "Redirects elsewhere",
};

export type Finding = { path: string; kind: FindingKind; severity: "error" | "warning" | "info"; detail: Record<string, unknown> };

export type AuditSummary = Record<string, number> & { pages: number; findings: number; durationMs: number; truncated?: number };

const MAX_PAGES = 400;
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12_000;
// Well inside the route's maxDuration so the run always records a result.
const CRAWL_DEADLINE_MS = 240_000;
const USER_AGENT = "DevelMo-SEO-Audit/1.0 (+https://develmo.com/admin/seo/audit)";

type Fetched = { path: string; status: number; html: string | null; error: string | null; location: string | null };

async function fetchPage(origin: string, path: string): Promise<Fetched> {
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const type = res.headers.get("content-type") ?? "";
    const html = res.ok && type.includes("text/html") ? await res.text() : null;
    return { path, status: res.status, html, error: null, location: res.headers.get("location") };
  } catch (err) {
    return { path, status: 0, html: null, error: err instanceof Error ? err.message : String(err), location: null };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// The canonical as a comparable target: the path when it names this site
// (the canonical origin or the origin being crawled), the full URL when it
// points at another host, null when it is not a URL at all.
function canonicalTarget(href: string, origin: string | undefined): string | null {
  try {
    const u = new URL(href, "https://develmo.com");
    const own = u.origin === "https://develmo.com" || (origin !== undefined && u.origin === origin);
    if (!own) return u.href;
    const p = u.pathname.replace(/\/{2,}/g, "/");
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
  } catch {
    return null;
  }
}

// Pure analysis over fetched pages, so the unit tests can drive it without
// a network.
export function analyse(pages: { path: string; status: number; scan: PageScan | null; error: string | null; location?: string | null }[], registry: string[], linkedFrom: Map<string, Set<string>>, linkTargets: Map<string, number>, origin?: string): Finding[] {
  const findings: Finding[] = [];
  const titles = new Map<string, string[]>();
  for (const p of pages) {
    if (!p.scan) {
      if (p.status >= 300 && p.status < 400) {
        findings.push({ path: p.path, kind: "redirected", severity: "info", detail: { status: p.status, location: p.location ?? null } });
        continue;
      }
      findings.push({ path: p.path, kind: "fetch_error", severity: "error", detail: { status: p.status, error: p.error } });
      continue;
    }
    const s = p.scan;
    if (!s.title) findings.push({ path: p.path, kind: "missing_title", severity: "error", detail: {} });
    else titles.set(s.title, [...(titles.get(s.title) ?? []), p.path]);
    if (s.description === null || !s.description.trim()) findings.push({ path: p.path, kind: "missing_description", severity: "error", detail: {} });
    else if (s.description.length > DESCRIPTION_LIMIT + 5) findings.push({ path: p.path, kind: "overlength_description", severity: "warning", detail: { length: s.description.length, limit: DESCRIPTION_LIMIT, description: s.description } });
    if (s.imagesMissingAlt.length) findings.push({ path: p.path, kind: "missing_alt", severity: "warning", detail: { count: s.imagesMissingAlt.length, images: s.imagesMissingAlt.slice(0, 20) } });
    if (!s.canonical) findings.push({ path: p.path, kind: "missing_canonical", severity: "warning", detail: {} });
    else {
      // A canonical that names another page tells search engines this one
      // is a duplicate of it; a layout-level canonical inherited by pages
      // without their own does exactly that.
      const target = canonicalTarget(s.canonical, origin);
      if (target !== null && target !== p.path) findings.push({ path: p.path, kind: "canonical_mismatch", severity: "error", detail: { canonical: s.canonical, target } });
    }
    if (s.h1s.length !== 1) findings.push({ path: p.path, kind: "h1_count", severity: s.h1s.length === 0 ? "error" : "warning", detail: { count: s.h1s.length, h1s: s.h1s.slice(0, 10) } });
  }
  for (const [title, paths] of titles) if (paths.length > 1) for (const path of paths) findings.push({ path, kind: "duplicate_title", severity: "warning", detail: { title, sharedWith: paths.filter((x) => x !== path) } });
  for (const [target, status] of linkTargets) {
    if (status < 400 && status !== 0) continue;
    const sources = [...(linkedFrom.get(target) ?? [])];
    for (const from of sources) findings.push({ path: from, kind: "broken_link", severity: "error", detail: { target, status } });
  }
  // An orphan is a registry route no crawled page links to. The home page
  // is the crawl's root, so it is never an orphan.
  for (const route of registry) if (route !== "/" && (linkedFrom.get(route)?.size ?? 0) === 0) findings.push({ path: route, kind: "orphan_page", severity: "warning", detail: {} });
  return findings;
}

export function summarise(findings: Finding[], pages: number, durationMs: number): AuditSummary {
  const summary: Record<string, number> = { pages, findings: findings.length, durationMs };
  for (const kind of FINDING_KINDS) summary[kind] = 0;
  for (const f of findings) summary[f.kind] = (summary[f.kind] ?? 0) + 1;
  return summary as AuditSummary;
}

export async function runSeoAudit(auditId: string, origin: string): Promise<void> {
  const db = getDb();
  const started = Date.now();
  try {
    const registry = (await listPublicRoutes()).map((r) => r.path);
    const queue: string[] = ["/"];
    const seen = new Set<string>(["/"]);
    const pages: { path: string; status: number; scan: PageScan | null; error: string | null; location: string | null }[] = [];
    let truncated = false;
    const linkedFrom = new Map<string, Set<string>>();
    const linkTargets = new Map<string, number>();

    // Breadth-first over internal links, then the registry routes nobody
    // linked to, so their own issues are reported as well.
    const visit = async (path: string) => {
      const f = await fetchPage(origin, path);
      linkTargets.set(path, f.status);
      const scan = f.html ? scanHtml(f.html) : null;
      pages.push({ path, status: f.status, scan, error: f.error, location: f.location });
      if (!scan) return;
      for (const href of scan.links) {
        const target = internalPath(href, origin, path);
        if (!target || target === path) continue;
        if (!linkedFrom.has(target)) linkedFrom.set(target, new Set());
        linkedFrom.get(target)!.add(path);
        if (!seen.has(target) && seen.size < MAX_PAGES) {
          seen.add(target);
          queue.push(target);
        }
      }
    };
    const overdue = () => Date.now() - started > CRAWL_DEADLINE_MS;
    while (queue.length && !overdue()) {
      const batch = queue.splice(0, CONCURRENCY * 2);
      await mapLimit(batch, CONCURRENCY, visit);
    }
    const unreached = registry.filter((r) => !seen.has(r));
    for (const r of unreached) seen.add(r);
    if (!overdue()) await mapLimit(unreached, CONCURRENCY, visit);
    if (queue.length || overdue()) truncated = true;

    const findings = analyse(pages, registry, linkedFrom, linkTargets, origin);
    const summary = summarise(findings, pages.length, Date.now() - started);
    if (truncated) summary.truncated = 1;
    if (findings.length) {
      for (let i = 0; i < findings.length; i += 200) {
        await db.insert(seoAuditFindings).values(findings.slice(i, i + 200).map((f) => ({ auditId, path: f.path, kind: f.kind, severity: f.severity, detail: f.detail })));
      }
    }
    await db.update(seoAudits).set({ status: "finished", finishedAt: sql`now()`, routesScanned: pages.length, summary }).where(eq(seoAudits.id, auditId));
  } catch (err) {
    await db.update(seoAudits).set({ status: "failed", finishedAt: sql`now()`, error: err instanceof Error ? err.message : String(err) }).where(eq(seoAudits.id, auditId));
  }
}
