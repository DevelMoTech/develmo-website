// Records per-route first-load JS and the largest client chunks from a
// finished build (brief §3.8), into <dist>/build-stats.json.
//
// Runs as npm's `postbuild`, so it fires after every `next build` including
// on Vercel, where the console can then read the JSON without needing the
// static chunk files themselves. Never fails a build: if the artifacts are
// not where it expects, it says so and exits 0.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dist = process.env.NEXT_DIST_DIR ?? ".next";
const root = process.cwd();
const distPath = path.join(root, dist);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

async function main() {
  if (!(await exists(distPath))) {
    console.log(`build-stats: ${dist} not found, nothing recorded`);
    return;
  }

  // Real byte sizes for every client chunk the build emitted.
  const chunkFiles = await walk(path.join(distPath, "static"), (f) => f.endsWith(".js"));
  const sizes = {};
  for (const f of chunkFiles) {
    const rel = path.relative(distPath, f).split(path.sep).join("/");
    sizes[rel] = (await stat(f)).size;
  }

  // One RSC client-reference manifest per route, each listing the client
  // chunks that route pulls in.
  const manifestFiles = await walk(path.join(distPath, "server", "app"), (f) => f.endsWith("_client-reference-manifest.js"));
  const manifests = [];
  for (const f of manifestFiles) {
    const source = await readFile(f, "utf8");
    // The file assigns into globalThis.__RSC_MANIFEST; evaluating it in a
    // throwaway global is simpler and more robust than parsing the literal.
    const scope = { __RSC_MANIFEST: {} };
    try {
      const fn = new Function("globalThis", source);
      fn(scope);
    } catch {
      continue;
    }
    for (const [key, manifest] of Object.entries(scope.__RSC_MANIFEST ?? {})) {
      manifests.push({ key, manifest });
    }
  }

  let rootMainFiles = [];
  let buildId = null;
  try {
    const bm = JSON.parse(await readFile(path.join(distPath, "build-manifest.json"), "utf8"));
    rootMainFiles = bm.rootMainFiles ?? [];
  } catch {
    // A build without the manifest still yields per-route chunks.
  }
  try {
    buildId = (await readFile(path.join(distPath, "BUILD_ID"), "utf8")).trim();
  } catch {
    // Not fatal; the snapshot is timestamped either way.
  }

  // Which source files reference each file in public/. The repo is present
  // at build time and not at runtime, so the map is recorded here for the
  // asset report to read later (brief §3.8).
  const publicFiles = await walk(path.join(root, "public"), () => true);
  const publicPaths = publicFiles.map((f) => "/" + path.relative(path.join(root, "public"), f).split(path.sep).join("/"));
  // src/lib/perf is the tooling that reports on these assets, not code that
  // renders them, so a mention there is not a reference.
  const sourceFiles = await walk(path.join(root, "src"), (f) => /\.(ts|tsx|css|mjs)$/.test(f) && !f.includes(`${path.sep}lib${path.sep}perf${path.sep}`));
  const sources = [];
  for (const f of sourceFiles) sources.push({ rel: path.relative(root, f).split(path.sep).join("/"), text: await readFile(f, "utf8") });
  const assetRefs = {};
  for (const p of publicPaths) {
    const refs = sources.filter((s) => s.text.includes(p)).map((s) => s.rel);
    if (refs.length) assetRefs[p] = refs;
  }

  const { buildStatsFrom } = await import(pathToFileURL(path.join(root, "src", "lib", "perf", "bundle.ts")).href);
  const stats = buildStatsFrom(manifests, rootMainFiles, sizes, { buildId, recordedAt: new Date().toISOString(), topChunks: 30 });

  const target = path.join(distPath, "build-stats.json");
  await writeFile(target, JSON.stringify({ ...stats, assetRefs }, null, 2));
  console.log(`build-stats: ${stats.routes.length} routes, shared ${stats.sharedBytes} B, total client ${stats.totalClientBytes} B, ${Object.keys(assetRefs).length} referenced assets -> ${dist}/build-stats.json`);
}

main().catch((err) => {
  console.log("build-stats: skipped,", err instanceof Error ? err.message : String(err));
});
