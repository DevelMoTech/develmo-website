import { describe, expect, it } from "vitest";
import { deviceClassFrom, formatMetric, isPlausible, normaliseRoute, p75, rate, THRESHOLDS } from "@/lib/perf/vitals";
import { buildStatsFrom, chunksForManifest, compareBuilds, formatBytes, normaliseChunkPath, routeFromManifestKey, type BuildStats } from "@/lib/perf/bundle";
import { dataCost, isFlagged, kindOf, totalsByKind, type AssetRow } from "@/lib/perf/assets";
import { shapeSnapshot } from "@/lib/perf/psi";
import { mediaSettingsSchema, revalidatePathSchema, revalidateTagSchema } from "@/lib/schemas/performance";

describe("web vitals", () => {
  it("collapses real paths onto the route that produced them", () => {
    expect(normaliseRoute("/")).toBe("/");
    expect(normaliseRoute("/what-we-do")).toBe("/what-we-do");
    expect(normaliseRoute("/our-blogs/turn-cameras-into-insight")).toBe("/our-blogs/[slug]");
    expect(normaliseRoute("/jobs/senior-engineer?utm=x")).toBe("/jobs/[slug]");
    expect(normaliseRoute("/what-we-do/computer-vision/")).toBe("/what-we-do/[slug]");
    // Anything unknown is bucketed, so arbitrary URLs cannot grow the table.
    expect(normaliseRoute("/admin/performance")).toBe("other");
    expect(normaliseRoute("/nonsense/deep/path")).toBe("other");
  });

  it("splits device class from the user agent", () => {
    expect(deviceClassFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile Safari")).toBe("mobile");
    expect(deviceClassFrom("Mozilla/5.0 (Linux; Android 14) Chrome Mobile Safari")).toBe("mobile");
    expect(deviceClassFrom("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe("desktop");
    expect(deviceClassFrom(null)).toBe("desktop");
  });

  it("rates against the published thresholds and drops implausible values", () => {
    expect(rate("LCP", 2000)).toBe("good");
    expect(rate("LCP", 3000)).toBe("needs-improvement");
    expect(rate("LCP", 5000)).toBe("poor");
    expect(rate("CLS", 0.05)).toBe("good");
    expect(rate("CLS", 0.3)).toBe("poor");
    expect(THRESHOLDS.INP.good).toBe(200);
    expect(isPlausible("LCP", 1200)).toBe(true);
    expect(isPlausible("LCP", -1)).toBe(false);
    expect(isPlausible("LCP", 999_999)).toBe(false);
    expect(isPlausible("CLS", 0.2)).toBe(true);
    expect(isPlausible("LCP", Number.NaN)).toBe(false);
  });

  it("formats each metric in its own unit and computes p75", () => {
    expect(formatMetric("LCP", 2483.6)).toBe("2484 ms");
    expect(formatMetric("CLS", 0.0812)).toBe("0.081");
    expect(formatMetric("LCP", null)).toBe("no data");
    expect(p75([])).toBeNull();
    expect(p75([1])).toBe(1);
    // Three quarters of these are at or below 4.
    expect(p75([1, 2, 3, 4])).toBe(3);
    expect(p75([10, 1, 5, 2, 8])).toBe(8);
  });
});

describe("bundle stats", () => {
  const manifests: { key: string; manifest: { clientModules: Record<string, { chunks: string[] }> } }[] = [
    { key: "/(site)/page", manifest: { clientModules: { a: { chunks: ["/_next/static/chunks/shared.js", "/_next/static/chunks/hero.js"] } } } },
    { key: "/(site)/our-blogs/[slug]/page", manifest: { clientModules: { a: { chunks: ["/_next/static/chunks/shared.js"] }, b: { chunks: ["/_next/static/chunks/post.js"] } } } },
    { key: "/(admin)/admin/(shell)/media/page", manifest: { clientModules: { a: { chunks: ["/_next/static/chunks/admin.js"] } } } },
  ];
  const sizes = { "static/chunks/shared.js": 1000, "static/chunks/hero.js": 500, "static/chunks/post.js": 250, "static/chunks/admin.js": 4000 };

  it("turns manifest keys into the URL the route serves", () => {
    expect(routeFromManifestKey("/(site)/page")).toBe("/");
    expect(routeFromManifestKey("/(site)/our-blogs/[slug]/page")).toBe("/our-blogs/[slug]");
    expect(routeFromManifestKey("/(admin)/admin/(shell)/media/page")).toBe("/admin/media");
    expect(routeFromManifestKey("/api/contact/route")).toBe("/api/contact");
    expect(normaliseChunkPath("/_next/static/chunks/a.js")).toBe("static/chunks/a.js");
    expect(normaliseChunkPath("static/chunks/a.js")).toBe("static/chunks/a.js");
  });

  it("reads only the js chunks a route's client modules reference", () => {
    expect(chunksForManifest(manifests[1].manifest).sort()).toEqual(["static/chunks/post.js", "static/chunks/shared.js"]);
    // Webpack-style [id, file] pairs and css entries are ignored.
    expect(chunksForManifest({ clientModules: { a: { chunks: [123, "static/chunks/x.css", "static/chunks/y.js"] } } })).toEqual(["static/chunks/y.js"]);
    expect(chunksForManifest({})).toEqual([]);
  });

  it("counts the shared runtime once per route and adds what each route adds", () => {
    const stats = buildStatsFrom(manifests, ["static/chunks/shared.js"], sizes, { buildId: "b1", recordedAt: "2026-09-05T00:00:00.000Z" });
    const byRoute = Object.fromEntries(stats.routes.map((r) => [r.route, r]));
    expect(stats.sharedBytes).toBe(1000);
    expect(stats.totalClientBytes).toBe(5750);
    expect(byRoute["/"].firstLoadBytes).toBe(1500);
    expect(byRoute["/"].ownBytes).toBe(500);
    expect(byRoute["/our-blogs/[slug]"].firstLoadBytes).toBe(1250);
    expect(byRoute["/admin/media"].firstLoadBytes).toBe(5000);
    // Largest first, with how many routes pull each one in.
    expect(stats.chunks[0]).toMatchObject({ file: "static/chunks/admin.js", bytes: 4000, routes: 1 });
    expect(stats.chunks.find((c) => c.file === "static/chunks/shared.js")).toMatchObject({ routes: 3 });
  });

  it("reports the delta against the previous build, and what appeared or went", () => {
    const before: BuildStats = { buildId: "b1", recordedAt: "", sharedBytes: 1000, totalClientBytes: 5000, routes: [{ route: "/", firstLoadBytes: 1500, ownBytes: 500, chunkCount: 2 }, { route: "/gone", firstLoadBytes: 1200, ownBytes: 200, chunkCount: 2 }], chunks: [] };
    const after: BuildStats = { buildId: "b2", recordedAt: "", sharedBytes: 1100, totalClientBytes: 5400, routes: [{ route: "/", firstLoadBytes: 1800, ownBytes: 700, chunkCount: 3 }, { route: "/new", firstLoadBytes: 1300, ownBytes: 200, chunkCount: 2 }], chunks: [] };
    const delta = compareBuilds(before, after)!;
    expect(delta.sharedBytes).toBe(100);
    expect(delta.totalClientBytes).toBe(400);
    expect(delta.routes).toEqual([{ route: "/", before: 1500, after: 1800, delta: 300 }]);
    expect(delta.added).toEqual(["/new"]);
    expect(delta.removed).toEqual(["/gone"]);
    expect(compareBuilds(null, after)).toBeNull();
  });

  it("formats bytes readably in both directions", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 kB");
    expect(formatBytes(1_572_864)).toBe("1.50 MB");
    expect(formatBytes(-2048)).toBe("-2.0 kB");
  });
});

describe("asset report", () => {
  it("classes files and flags the three hero clips", () => {
    expect(kindOf("/hero-1.mp4")).toBe("video");
    expect(kindOf("/develmo-logo.png")).toBe("image");
    expect(kindOf("/font.woff2")).toBe("font");
    expect(kindOf("/thing.bin")).toBe("other");
    expect(isFlagged("/hero-1.mp4")).toBe(true);
    expect(isFlagged("/hero-2.mp4")).toBe(true);
    expect(isFlagged("/hero-3.mp4")).toBe(true);
    expect(isFlagged("/hero-1.jpg")).toBe(false);
  });

  it("costs a download in data, money and time on a slow link", () => {
    // The three clips as they are on disk today.
    const cost = dataCost(1_001_771 + 561_996 + 1_052_957);
    expect(cost.megabytes).toBeCloseTo(2.496, 2);
    expect(cost.gbp).toBeCloseTo(0.1248, 3);
    expect(cost.roamingGbp).toBeCloseTo(1.248, 2);
    // 2.6 MB over a 1.6 Mbps link.
    expect(cost.secondsOnSlow4g).toBeCloseTo(13.08, 1);
  });

  it("totals by kind using the transferred bytes when they were measured", () => {
    const rows: AssetRow[] = [
      { path: "/a.mp4", kind: "video", contentType: "video/mp4", bytes: 1000, transferBytes: 900, encoding: null, routes: [], source: "public" },
      { path: "/b.png", kind: "image", contentType: "image/png", bytes: 100, transferBytes: null, encoding: null, routes: [], source: "public" },
      { path: "/c.png", kind: "image", contentType: "image/png", bytes: 50, transferBytes: 50, encoding: null, routes: [], source: "public" },
    ];
    expect(totalsByKind(rows)).toEqual([
      { kind: "video", bytes: 900, count: 1 },
      { kind: "image", bytes: 150, count: 2 },
    ]);
  });
});

describe("PageSpeed snapshots", () => {
  // A trimmed but structurally real PSI payload.
  const payload = {
    lighthouseResult: {
      requestedUrl: "https://develmo.com/",
      finalUrl: "https://develmo.com/",
      lighthouseVersion: "12.0.0",
      categories: {
        performance: { score: 0.62, auditRefs: [{ id: "uses-responsive-images", group: "load-opportunities" }, { id: "total-byte-weight", group: "diagnostics" }, { id: "passed-audit", group: "load-opportunities" }, { id: "not-applicable", group: "diagnostics" }] },
        accessibility: { score: 0.98 },
        seo: { score: null },
      },
      audits: {
        "uses-responsive-images": { title: "Properly size images", description: "Serve images that are [appropriately sized](https://example.com).", score: 0.3, displayValue: "Potential savings of 120 KiB", details: { overallSavingsMs: 450, overallSavingsBytes: 122880 } },
        "total-byte-weight": { title: "Avoids enormous network payloads", description: "Large payloads cost money.", score: 0.4, displayValue: "Total size was 3,100 KiB", details: {} },
        "passed-audit": { title: "Passed", description: "", score: 1 },
        "not-applicable": { title: "Not applicable", description: "", scoreDisplayMode: "notApplicable" },
        "largest-contentful-paint": { title: "LCP", numericValue: 3120.5, displayValue: "3.1 s" },
      },
    },
  };

  it("reports PageSpeed's own categories and opportunities without reinterpreting them", () => {
    const snap = shapeSnapshot(payload);
    expect(snap.scores).toEqual({ performance: 0.62, accessibility: 0.98, seo: null });
    // Passed and not-applicable audits are not opportunities; the rest keep
    // PSI's own titles, wording and stated savings, ordered by saving.
    expect(snap.opportunities.map((o) => o.id)).toEqual(["uses-responsive-images", "total-byte-weight"]);
    expect(snap.opportunities[0]).toMatchObject({ title: "Properly size images", displayValue: "Potential savings of 120 KiB", savingsMs: 450, savingsBytes: 122880 });
    expect(snap.metrics["largest-contentful-paint"]).toEqual({ value: 3120.5, display: "3.1 s" });
    expect(snap.fetchedUrl).toBe("https://develmo.com/");
    expect(snap.lighthouseVersion).toBe("12.0.0");
  });

  it("survives a payload with nothing in it", () => {
    const snap = shapeSnapshot({});
    expect(snap.scores).toEqual({});
    expect(snap.opportunities).toEqual([]);
    expect(snap.fetchedUrl).toBeNull();
  });
});

describe("performance schemas", () => {
  it("keeps the console and the API out of the paths it will act on", () => {
    expect(revalidatePathSchema.safeParse({ path: "/what-we-do", type: "page" }).success).toBe(true);
    expect(revalidatePathSchema.safeParse({ path: "/admin/performance", type: "page" }).success).toBe(false);
    expect(revalidatePathSchema.safeParse({ path: "/api/contact", type: "page" }).success).toBe(false);
    expect(revalidatePathSchema.safeParse({ path: "not-a-path" }).success).toBe(false);
  });

  it("only accepts tags the repo layer actually uses", () => {
    expect(revalidateTagSchema.safeParse({ tag: "posts" }).success).toBe(true);
    expect(revalidateTagSchema.safeParse({ tag: "made-up" }).success).toBe(false);
  });

  it("holds the media settings to a sane shape", () => {
    expect(mediaSettingsSchema.safeParse({ heroAutoplayMobile: true, posterOnlyMaxWidth: 0 }).success).toBe(true);
    expect(mediaSettingsSchema.safeParse({ heroAutoplayMobile: false, posterOnlyMaxWidth: 768 }).success).toBe(true);
    expect(mediaSettingsSchema.safeParse({ heroAutoplayMobile: true, posterOnlyMaxWidth: -1 }).success).toBe(false);
    expect(mediaSettingsSchema.safeParse({ heroAutoplayMobile: true, posterOnlyMaxWidth: 9999 }).success).toBe(false);
  });
});
