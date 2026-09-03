import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { applySeoOverride, basePageMeta } from "@/lib/meta";
import { analyse, summarise } from "@/lib/seo/audit";
import { internalPath, scanHtml } from "@/lib/seo/html";
import { buildOrganizationLd, DEFAULT_ORGANIZATION_FACTS, validateOrganizationLd } from "@/lib/seo/organization";
import { trustedOrigin } from "@/lib/seo/origin";
import { buildRedirectMap, matchRedirect, normalizePath, redirectTarget } from "@/lib/seo/redirect-map";
import { checkRedirectRule } from "@/lib/seo/redirect-rules";
import { DEFAULT_ROBOTS_BODY, renderRobots, validateRobots } from "@/lib/seo/robots";
import { renderSitemapXml } from "@/lib/seo/sitemap";
import { STATIC_REDIRECTS } from "@/lib/seo/static-redirects";
import type { SeoOverride } from "@/lib/seo/overrides";
import { site } from "@/lib/site";

const LEGACY_ROBOTS = "User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /studio\nDisallow: /admin\nDisallow: /api/admin\n\nHost: https://develmo.com\nSitemap: https://develmo.com/sitemap.xml\n";

describe("redirect map", () => {
  it("normalises paths the way the proxy matches them", () => {
    expect(normalizePath("/old-page/")).toBe("/old-page");
    expect(normalizePath("old//page?x=1#top")).toBe("/old/page");
    expect(normalizePath("/")).toBe("/");
  });

  it("matches only enabled sources and keeps the query string on relative targets", () => {
    const map = buildRedirectMap([{ source: "/legacy/", destination: "/what-we-do", code: 301 }], "2026-01-01T00:00:00.000Z");
    const rule = matchRedirect(map, "/legacy");
    expect(rule?.code).toBe(301);
    expect(matchRedirect(map, "/legacy/other")).toBeNull();
    expect(redirectTarget(rule!, "https://develmo.com", "?service=ai")).toBe("https://develmo.com/what-we-do?service=ai");
    expect(redirectTarget({ source: "/x", destination: "https://example.org/a", code: 302 }, "https://develmo.com", "?q=1")).toBe("https://example.org/a");
  });

  it("never captures robots.txt, the sitemap, the console or the API, and keeps fragments after the query", () => {
    const map = buildRedirectMap([{ source: "/robots.txt", destination: "/x", code: 301 }, { source: "/sitemap.xml", destination: "/x", code: 301 }, { source: "/admin", destination: "/x", code: 301 }, { source: "/ok", destination: "/what-we-do#faq", code: 301 }], "2026-01-01T00:00:00.000Z");
    expect(Object.keys(map.rules)).toEqual(["/ok"]);
    expect(matchRedirect({ rules: { "/api/x": { source: "/api/x", destination: "/", code: 301 } }, generatedAt: "" }, "/api/x")).toBeNull();
    expect(redirectTarget(map.rules["/ok"], "https://develmo.com", "?service=ai")).toBe("https://develmo.com/what-we-do?service=ai#faq");
    expect(normalizePath("/caf%C3%A9/")).toBe("/café");
  });

  it("mirrors the static list in next.config.ts exactly", async () => {
    const fromConfig = await nextConfig.redirects!();
    expect(fromConfig).toEqual(STATIC_REDIRECTS);
  });
});

describe("redirect rule checks", () => {
  const routes = ["/", "/what-we-do", "/who-we-are"];
  const existing = [
    { id: "a", source: "/a", destination: "/b", enabled: true },
    { id: "b", source: "/b", destination: "/what-we-do", enabled: true },
  ];

  it("rejects loops, static conflicts, duplicates and self targets", () => {
    expect(checkRedirectRule({ source: "/what-we-do", destination: "/a", enabled: true }, existing, STATIC_REDIRECTS, routes).errors.join(" ")).toMatch(/Loop/);
    expect(checkRedirectRule({ source: "/about", destination: "/x", enabled: true }, existing, STATIC_REDIRECTS, routes).errors.join(" ")).toMatch(/next\.config\.ts/);
    expect(checkRedirectRule({ source: "/a", destination: "/x", enabled: true }, existing, STATIC_REDIRECTS, routes).errors.join(" ")).toMatch(/already exists/);
    expect(checkRedirectRule({ source: "/same", destination: "/same/", enabled: true }, existing, STATIC_REDIRECTS, routes).errors.join(" ")).toMatch(/same path/);
    expect(checkRedirectRule({ source: "/admin/x", destination: "/", enabled: true }, existing, STATIC_REDIRECTS, routes).errors.join(" ")).toMatch(/never redirected/);
  });

  it("warns about chains and hidden pages without blocking", () => {
    const chain = checkRedirectRule({ source: "/c", destination: "/a", enabled: true }, existing, STATIC_REDIRECTS, routes);
    expect(chain.errors).toEqual([]);
    expect(chain.warnings.join(" ")).toMatch(/Chain: \/c to \/a to \/b to \/what-we-do/);
    const hidden = checkRedirectRule({ source: "/who-we-are", destination: "/what-we-do", enabled: true }, existing, STATIC_REDIRECTS, routes);
    expect(hidden.errors).toEqual([]);
    expect(hidden.warnings.join(" ")).toMatch(/live page/);
    const editing = checkRedirectRule({ id: "a", source: "/a", destination: "/who-we-are", enabled: true }, existing, STATIC_REDIRECTS, routes);
    expect(editing.errors).toEqual([]);
  });
});

describe("robots.txt", () => {
  it("serves the legacy file byte for byte from the default body", () => {
    expect(renderRobots(DEFAULT_ROBOTS_BODY)).toBe(LEGACY_ROBOTS);
    expect(validateRobots(DEFAULT_ROBOTS_BODY).errors).toEqual([]);
  });

  it("keeps /admin and /api/admin disallowed whatever is typed", () => {
    const out = renderRobots("User-agent: *\nAllow: /admin\nAllow: /api/admin/\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /private\n");
    expect(out).not.toMatch(/Allow: \/admin/);
    const groups = out.split("\n\n").filter((g) => g.startsWith("User-Agent"));
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(g).toMatch(/Disallow: \/admin\n/);
      expect(g).toMatch(/Disallow: \/api\/admin/);
    }
    expect(out).toMatch(/Sitemap: https:\/\/develmo\.com\/sitemap\.xml\n$/);
  });

  it("drops wildcard and encoded allows that could out-rank the protected disallows, keeps Allow: /", () => {
    const out = renderRobots("User-agent: *\nAllow: /\nAllow: /*admin\nAllow: /admin*\nAllow: /%61dmin\nAllow: /api/*\nAllow: /ap*\nAllow: /a\n");
    // Shorter patterns lose to the longer protected Disallow, so they stay.
    expect(out).toContain("Allow: /\n");
    expect(out).toContain("Allow: /ap*\n");
    expect(out).toContain("Allow: /api/*\n");
    expect(out).toContain("Allow: /a\n");
    expect(out).not.toMatch(/Allow: \/\*admin|Allow: \/admin\*|Allow: \/%61dmin/);
    expect(out).toContain("Disallow: /admin\nDisallow: /api/admin\n");
  });

  it("ends a group whose only lines were dropped instead of merging it with the next", () => {
    const out = renderRobots("User-agent: a\nAllow: /admin\nUser-agent: b\nDisallow: /x\n");
    expect(out).toBe("User-Agent: a\nDisallow: /admin\nDisallow: /api/admin\n\nUser-Agent: b\nDisallow: /x\nDisallow: /admin\nDisallow: /api/admin\n\nHost: https://develmo.com\nSitemap: https://develmo.com/sitemap.xml\n");
  });

  it("adds a group when the body has none and reports structural errors", () => {
    expect(renderRobots("# nothing here\n")).toMatch(/User-Agent: \*\nDisallow: \/admin\nDisallow: \/api\/admin/);
    const report = validateRobots("Disallow: /x\nFoo: bar\nUser-agent: *\nDisallow: nope\n");
    expect(report.errors).toHaveLength(3);
    expect(report.errors[0]).toMatch(/must follow a User-agent/);
    expect(report.errors[1]).toMatch(/unknown directive/);
    expect(report.errors[2]).toMatch(/start with \//);
  });
});

describe("sitemap XML", () => {
  it("renders the exact format the sitemap.ts convention produced", () => {
    const when = new Date("2026-09-03T17:18:20.322Z");
    const xml = renderSitemapXml([
      { url: "https://develmo.com", lastModified: when, changeFrequency: "monthly", priority: 1 },
      { url: "https://develmo.com/what-we-do", lastModified: when, changeFrequency: "monthly", priority: 0.7 },
    ]);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>https://develmo.com</loc>\n<lastmod>2026-09-03T17:18:20.322Z</lastmod>\n<changefreq>monthly</changefreq>\n<priority>1</priority>\n</url>\n<url>\n<loc>https://develmo.com/what-we-do</loc>\n<lastmod>2026-09-03T17:18:20.322Z</lastmod>\n<changefreq>monthly</changefreq>\n<priority>0.7</priority>\n</url>\n</urlset>\n',
    );
  });
});

describe("Organization JSON-LD", () => {
  it("builds the legacy markup from the default facts and validates", () => {
    const ld = buildOrganizationLd(DEFAULT_ORGANIZATION_FACTS);
    expect(Object.keys(ld)).toEqual(["@context", "@type", "name", "url", "email", "description", "address", "sameAs"]);
    expect(ld.sameAs).toEqual(site.social.map((s) => s.href));
    const report = validateOrganizationLd(ld);
    expect(report.errors).toEqual([]);
    expect(report.warnings.join(" ")).toMatch(/logo/);
  });

  it("rejects a bad email, a missing address field and a non https profile", () => {
    const ld = buildOrganizationLd({ ...DEFAULT_ORGANIZATION_FACTS, email: "not-an-email", postalCode: "" });
    const errors = validateOrganizationLd(ld).errors;
    expect(errors).toContain("email must be a valid address");
    expect(errors).toContain("address.postalCode is required");
    expect(validateOrganizationLd({ ...ld, sameAs: ["http://insecure.example"] }).errors.join(" ")).toMatch(/not an https URL/);
    expect(validateOrganizationLd({ ...ld, email: "a@b.co", address: { ...(ld.address as object), postalCode: "N1" }, telephone: "abc" }).errors.join(" ")).toMatch(/telephone/);
  });
});

describe("trusted origin for console fetches", () => {
  it("accepts the site and local servers, falls back to the canonical origin otherwise", () => {
    expect(trustedOrigin("http://localhost:3010")).toBe("http://localhost:3010");
    expect(trustedOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(trustedOrigin("https://develmo.com")).toBe("https://develmo.com");
    expect(trustedOrigin("https://preview-abc.vercel.app")).toBe(site.url);
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    expect(trustedOrigin("https://preview-abc.vercel.app")).toBe("https://preview-abc.vercel.app");
    delete process.env.VERCEL_URL;
    expect(trustedOrigin("https://evil.example")).toBe(site.url);
    expect(trustedOrigin("https://develmo.com.evil.example")).toBe(site.url);
    expect(trustedOrigin("http://develmo.com")).toBe(site.url);
    expect(trustedOrigin("not a url")).toBe(site.url);
  });
});

describe("metadata overrides", () => {
  const base = basePageMeta({ title: "What We Do", description: "Six pillars.", path: "/what-we-do" });
  const override = (patch: Partial<SeoOverride>): SeoOverride => ({ path: "/what-we-do", metaTitle: null, metaDescription: null, canonical: null, ogImage: null, noindex: null, nofollow: null, sitemapInclude: null, sitemapChangefreq: null, sitemapPriority: null, faqEnabled: null, updatedAt: "2026-01-01T00:00:00.000Z", ...patch });

  it("returns the base untouched without an override", () => {
    expect(applySeoOverride(base, null)).toBe(base);
  });

  it("builds a full social block for pages that inherit the layout's, and never lifts an editor noindex", () => {
    const plain: Metadata = { title: "Our Blogs", description: "Articles.", robots: { index: false, follow: true } };
    const out = applySeoOverride(plain, override({ path: "/our-blogs", metaTitle: "Insights", nofollow: true }), "/our-blogs");
    expect(out.title).toBe("Insights");
    expect((out.openGraph as { title: string; url: string; description: string; siteName: string }).title).toBe("Insights | DevelMo");
    expect((out.openGraph as { url: string }).url).toBe("/our-blogs");
    expect((out.openGraph as { description: string }).description).toBe("Articles.");
    expect((out.twitter as { title: string }).title).toBe("Insights | DevelMo");
    expect(out.robots).toEqual({ index: false, follow: false });
    const untouched = applySeoOverride(plain, override({ path: "/our-blogs", canonical: "/our-blogs" }), "/our-blogs");
    expect(untouched.openGraph).toBeUndefined();
    expect(untouched.alternates?.canonical).toBe("/our-blogs");
  });

  it("serves a home page title override as the whole title, without the template suffix", () => {
    const out = applySeoOverride({}, override({ path: "/", metaTitle: "DevelMo, AI partners" }), "/");
    expect(out.title).toEqual({ absolute: "DevelMo, AI partners" });
    expect((out.openGraph as { title: string }).title).toBe("DevelMo, AI partners");
    expect((out.openGraph as { url: string }).url).toBe("/");
  });

  it("applies each field independently", () => {
    const out = applySeoOverride(base, override({ metaDescription: "New description", noindex: true }));
    expect(out.description).toBe("New description");
    expect(out.title).toBe("What We Do");
    expect((out.openGraph as { description: string }).description).toBe("New description");
    expect((out.openGraph as { title: string }).title).toBe("What We Do | DevelMo");
    expect(out.robots).toEqual({ index: false, follow: true });
    expect(out.alternates?.canonical).toBe("/what-we-do");
    const img = applySeoOverride(base, override({ ogImage: { id: "x", url: "https://cdn.example/og.png", width: 1200, height: 630, alt: "Alt" } }));
    expect((img.openGraph as { images: { url: string }[] }).images[0].url).toBe("https://cdn.example/og.png");
    expect((img.twitter as { images: string[] }).images).toEqual(["https://cdn.example/og.png"]);
  });
});

describe("audit scanner", () => {
  const html = `<!doctype html><html lang="en"><head><title>Hello | DevelMo</title><meta name="description" content="A page"><link rel="canonical" href="https://develmo.com/hello"><meta name="robots" content="noindex"></head><body><h1>One</h1><h1>Two</h1><img src="/a.png"><img src="/b.png" alt=""><a href="/what-we-do">x</a><a href="https://other.example/">y</a><a href="mailto:a@b.co">z</a><a href="/what-we-do/#faq">w</a><script>var s = "<h1>not a heading</h1>";</script></body></html>`;

  it("extracts head data, headings, images and links", () => {
    const s = scanHtml(html);
    expect(s.title).toBe("Hello | DevelMo");
    expect(s.description).toBe("A page");
    expect(s.canonical).toBe("https://develmo.com/hello");
    expect(s.robots).toBe("noindex");
    expect(s.lang).toBe("en");
    expect(s.h1s).toEqual(["One", "Two"]);
    expect(s.imagesMissingAlt).toEqual(["/a.png"]);
    expect(s.links).toHaveLength(4);
    expect(s.links.map((l) => internalPath(l, "https://develmo.com", "/hello"))).toEqual(["/what-we-do", null, null, "/what-we-do"]);
  });

  it("reports duplicates, broken links, orphans and H1 counts", () => {
    const pages = [
      { path: "/", status: 200, scan: scanHtml(html), error: null },
      { path: "/two", status: 200, scan: scanHtml(html.replace("<h1>Two</h1>", "").replace("/a.png\"", "/a.png\" alt=\"ok\"")), error: null },
      { path: "/missing", status: 404, scan: null, error: null },
    ];
    const linkedFrom = new Map<string, Set<string>>([["/two", new Set(["/"])], ["/missing", new Set(["/"])], ["/what-we-do", new Set(["/", "/two"])]]);
    const targets = new Map<string, number>([["/", 200], ["/two", 200], ["/missing", 404], ["/what-we-do", 200]]);
    const findings = analyse(pages, ["/", "/two", "/what-we-do", "/orphan"], linkedFrom, targets);
    const kinds = (k: string) => findings.filter((f) => f.kind === k).map((f) => f.path);
    expect(kinds("duplicate_title")).toEqual(["/", "/two"]);
    expect(kinds("broken_link")).toEqual(["/"]);
    expect(kinds("orphan_page")).toEqual(["/orphan"]);
    expect(kinds("h1_count")).toEqual(["/"]);
    expect(kinds("missing_alt")).toEqual(["/"]);
    expect(kinds("fetch_error")).toEqual(["/missing"]);
    expect(kinds("canonical_mismatch")).toEqual(["/", "/two"]);
    expect(kinds("missing_canonical")).toEqual([]);
    const summary = summarise(findings, pages.length, 1234);
    expect(summary.pages).toBe(3);
    expect(summary.findings).toBe(findings.length);
    expect(summary.duplicate_title).toBe(2);
  });
});
