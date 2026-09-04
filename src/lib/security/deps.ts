import { readFile } from "node:fs/promises";
import path from "node:path";
import { SEVERITIES, summarise, type Advisory, type DependencyReport, type Severity } from "./deps-types";

export { SEVERITIES, summarise };
export type { Advisory, DependencyReport, DependencySummary, Severity } from "./deps-types";

// Dependency status (brief §3.7). `npm audit` itself needs the npm CLI and a
// writable project directory, neither of which a serverless function has, so
// this asks the same question the same way npm does: it posts the installed
// name and version list to the registry's bulk advisory endpoint and reads
// the advisories back. The result is identical in substance to
// `npm audit --json` and it runs anywhere the site runs.

const BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const TIMEOUT_MS = 20_000;
const MAX_PACKAGES_PER_REQUEST = 500;

type LockPackage = { version?: string; dev?: boolean; devOptional?: boolean; link?: boolean };
type Lockfile = { packages?: Record<string, LockPackage> };

// name -> { versions, dev } from package-lock.json, which is the same tree
// npm audit reads.
export function collectInstalled(lock: Lockfile): Map<string, { versions: Set<string>; dev: boolean }> {
  const out = new Map<string, { versions: Set<string>; dev: boolean }>();
  for (const [entryPath, entry] of Object.entries(lock.packages ?? {})) {
    if (!entryPath || entry.link) continue;
    const marker = entryPath.lastIndexOf("node_modules/");
    if (marker < 0) continue;
    const name = entryPath.slice(marker + "node_modules/".length);
    if (!name || !entry.version) continue;
    const dev = entry.dev === true || entry.devOptional === true;
    const existing = out.get(name);
    if (existing) {
      existing.versions.add(entry.version);
      // A package reachable from production anywhere is a production one.
      existing.dev = existing.dev && dev;
    } else {
      out.set(name, { versions: new Set([entry.version]), dev });
    }
  }
  return out;
}

type BulkAdvisory = {
  id?: number;
  url?: string;
  title?: string;
  severity?: string;
  vulnerable_versions?: string;
  cwe?: string[];
};

function normaliseSeverity(raw: string | undefined): Severity {
  const s = (raw ?? "").toLowerCase();
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : "info";
}

async function askRegistry(batch: Record<string, string[]>): Promise<Record<string, BulkAdvisory[]>> {
  const res = await fetch(BULK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`registry answered ${res.status}`);
  return (await res.json()) as Record<string, BulkAdvisory[]>;
}

export async function runDependencyAudit(cwd = process.cwd()): Promise<DependencyReport> {
  const lockPath = path.join(cwd, "package-lock.json");
  let lock: Lockfile;
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8")) as Lockfile;
  } catch (err) {
    throw new Error(`could not read package-lock.json (${err instanceof Error ? err.message : String(err)})`);
  }
  const installed = collectInstalled(lock);
  if (installed.size === 0) throw new Error("package-lock.json listed no installed packages");

  const names = [...installed.keys()].sort();
  const advisories: Advisory[] = [];
  for (let i = 0; i < names.length; i += MAX_PACKAGES_PER_REQUEST) {
    const batch: Record<string, string[]> = {};
    for (const name of names.slice(i, i + MAX_PACKAGES_PER_REQUEST)) {
      batch[name] = [...installed.get(name)!.versions];
    }
    const found = await askRegistry(batch);
    for (const [name, list] of Object.entries(found)) {
      const entry = installed.get(name);
      for (const a of list ?? []) {
        advisories.push({
          package: name,
          installed: entry ? [...entry.versions] : [],
          severity: normaliseSeverity(a.severity),
          title: a.title ?? "Advisory",
          url: a.url ?? (a.id ? `https://github.com/advisories/GHSA-${a.id}` : "https://github.com/advisories"),
          vulnerableVersions: a.vulnerable_versions ?? "",
          cwe: a.cwe ?? [],
          dev: entry?.dev ?? false,
        });
      }
    }
  }
  const order = new Map(SEVERITIES.map((s, i) => [s, i]));
  advisories.sort((a, b) => (order.get(a.severity)! - order.get(b.severity)!) || a.package.localeCompare(b.package));
  return { summary: summarise(advisories, installed.size), advisories, source: "npm registry bulk advisories" };
}
