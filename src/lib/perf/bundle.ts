// Build and bundle stats (brief §3.8). Pure parsing over inputs the caller
// reads from disk, so the unit tests drive it with literals and the same
// code runs in the build script and the console.
//
// Turbopack does not print a "First Load JS" column and writes no
// app-build-manifest, but it does write one RSC client-reference manifest
// per route listing the client chunks that route loads. Summing those
// chunks, plus the root client runtime every route pays for, gives a real
// per-route first-load figure from real file sizes rather than an estimate.

export type ChunkSizes = Record<string, number>;

export type RouteBundle = {
  // The app-router path, e.g. "/our-blogs/[slug]".
  route: string;
  // Bytes of client JS this route loads on a cold visit, shared runtime included.
  firstLoadBytes: number;
  // Bytes unique to this route, on top of the shared runtime.
  ownBytes: number;
  chunkCount: number;
};

export type ChunkEntry = { file: string; bytes: number; routes: number };

export type BuildStats = {
  buildId: string | null;
  recordedAt: string;
  sharedBytes: number;
  totalClientBytes: number;
  routes: RouteBundle[];
  chunks: ChunkEntry[];
};

// "/_next/static/chunks/abc.js" and "static/chunks/abc.js" both name the
// same file; the sizes map is keyed on the latter.
export function normaliseChunkPath(p: string): string {
  let s = p.trim();
  if (s.startsWith("/_next/")) s = s.slice("/_next/".length);
  else if (s.startsWith("_next/")) s = s.slice("_next/".length);
  else if (s.startsWith("/")) s = s.slice(1);
  return s;
}

// The route key inside a client-reference manifest is the app-router file
// path: "/(site)/our-blogs/[slug]/page". Route groups are not part of the
// URL, so they come out.
export function routeFromManifestKey(key: string): string {
  let r = key.replace(/\/page$/, "").replace(/\/route$/, "");
  r = r.replace(/\/\([^/)]+\)/g, "");
  if (!r.startsWith("/")) r = `/${r}`;
  r = r.replace(/\/{2,}/g, "/");
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r === "" ? "/" : r;
}

type ClientModule = { chunks?: unknown };
type RscManifest = { clientModules?: Record<string, ClientModule> };

// Every distinct chunk a route's client modules pull in.
export function chunksForManifest(manifest: RscManifest): string[] {
  const out = new Set<string>();
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    const chunks = mod?.chunks;
    if (!Array.isArray(chunks)) continue;
    for (const c of chunks) {
      // Turbopack lists plain paths; webpack alternates [id, file] pairs,
      // so anything that does not look like a .js path is skipped.
      if (typeof c === "string" && c.endsWith(".js")) out.add(normaliseChunkPath(c));
    }
  }
  return [...out];
}

export function buildStatsFrom(
  manifests: { key: string; manifest: RscManifest }[],
  rootMainFiles: string[],
  sizes: ChunkSizes,
  opts: { buildId?: string | null; recordedAt: string; topChunks?: number },
): BuildStats {
  const shared = new Set(rootMainFiles.map(normaliseChunkPath));
  const sizeOf = (f: string) => sizes[f] ?? 0;
  const sharedBytes = [...shared].reduce((n, f) => n + sizeOf(f), 0);

  const usage = new Map<string, number>();
  const routes: RouteBundle[] = [];
  for (const { key, manifest } of manifests) {
    const route = routeFromManifestKey(key);
    // The console is measured by its own page, not by the public report.
    const own = chunksForManifest(manifest).filter((c) => !shared.has(c));
    for (const c of own) usage.set(c, (usage.get(c) ?? 0) + 1);
    const ownBytes = own.reduce((n, f) => n + sizeOf(f), 0);
    routes.push({ route, firstLoadBytes: sharedBytes + ownBytes, ownBytes, chunkCount: own.length + shared.size });
  }
  routes.sort((a, b) => b.firstLoadBytes - a.firstLoadBytes || a.route.localeCompare(b.route));

  const chunkEntries: ChunkEntry[] = [];
  for (const f of shared) chunkEntries.push({ file: f, bytes: sizeOf(f), routes: routes.length });
  for (const [f, n] of usage) chunkEntries.push({ file: f, bytes: sizeOf(f), routes: n });
  chunkEntries.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));

  return {
    buildId: opts.buildId ?? null,
    recordedAt: opts.recordedAt,
    sharedBytes,
    totalClientBytes: Object.values(sizes).reduce((n, b) => n + b, 0),
    routes,
    chunks: chunkEntries.slice(0, opts.topChunks ?? 25),
  };
}

export type RouteDelta = { route: string; before: number | null; after: number | null; delta: number };

export type BuildDelta = {
  sharedBytes: number;
  totalClientBytes: number;
  routes: RouteDelta[];
  added: string[];
  removed: string[];
};

// What changed against the previously recorded build. Routes are matched by
// path; a route present in only one build is reported as added or removed
// rather than counted as a huge delta.
export function compareBuilds(previous: BuildStats | null, current: BuildStats): BuildDelta | null {
  if (!previous) return null;
  const before = new Map(previous.routes.map((r) => [r.route, r.firstLoadBytes]));
  const after = new Map(current.routes.map((r) => [r.route, r.firstLoadBytes]));
  const routes: RouteDelta[] = [];
  for (const [route, bytes] of after) {
    const was = before.get(route);
    if (was === undefined) continue;
    if (was !== bytes) routes.push({ route, before: was, after: bytes, delta: bytes - was });
  }
  routes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    sharedBytes: current.sharedBytes - previous.sharedBytes,
    totalClientBytes: current.totalClientBytes - previous.totalClientBytes,
    routes,
    added: [...after.keys()].filter((r) => !before.has(r)).sort(),
    removed: [...before.keys()].filter((r) => !after.has(r)).sort(),
  };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "unknown";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1024) return `${sign}${v} B`;
  if (v < 1024 * 1024) return `${sign}${(v / 1024).toFixed(1)} kB`;
  return `${sign}${(v / (1024 * 1024)).toFixed(2)} MB`;
}
