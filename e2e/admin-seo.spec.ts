import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const STARTED = new Date();

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string) {
  const email = uniqueEmail("seo-admin");
  await createUser({ email, password: PASSWORD, role: "admin", name: "E2E seo admin", totpSecret: TOTP_SECRET });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, { headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL }, data: { code: await generate({ secret: TOTP_SECRET }) } });
  expect(verify.status()).toBe(200);
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf, request: context.request };
}

function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: Record<string, unknown>) {
  return request.post(`${baseURL}${path}`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data });
}

// Anonymous public requests: no cookies, no session, like a visitor or a crawler.
async function publicText(browser: Browser, url: string): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const res = await ctx.request.get(url, { maxRedirects: 0 });
  const out = { status: res.status(), text: await res.text(), headers: res.headers() };
  await ctx.close();
  return out;
}

const metaDescription = (html: string): string | null => html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null;

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs: number, everyMs = 500): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (ok(value)) return { value, ms: Date.now() - start };
    if (Date.now() - start > timeoutMs) return { value, ms: Date.now() - start };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

async function xactCount(): Promise<number> {
  const r = await db().query<{ n: string }>("select (xact_commit + xact_rollback)::text as n from pg_stat_database where datname = current_database()");
  return Number(r.rows[0].n);
}

// Rows this spec touches are snapshotted first and put back afterwards, so
// a robots body, Organization facts or an override that already existed on
// the target database survives the run.
const PATHS = ["/what-we-do", "/cookies", "/what-we-do/generative-ai-llm-integration"];
const KEYS = ["robots", "org_schema"];
let overrideSnapshot: Record<string, unknown>[] = [];
let settingsSnapshot: { key: string; value: unknown }[] = [];

test.beforeAll(async () => {
  const pool = db();
  overrideSnapshot = (await pool.query("select * from seo_overrides where path = any($1)", [PATHS])).rows;
  settingsSnapshot = (await pool.query<{ key: string; value: unknown }>("select key, value from settings where key = any($1)", [KEYS])).rows;
});

test.afterAll(async () => {
  const pool = db();
  await pool.query("delete from seo_overrides where path = any($1)", [PATHS]);
  for (const row of overrideSnapshot) {
    const cols = Object.keys(row);
    await pool.query(`insert into seo_overrides (${cols.map((c) => `"${c}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, cols.map((c) => row[c]));
  }
  await pool.query("delete from settings where key = any($1)", [KEYS]);
  for (const row of settingsSnapshot) await pool.query("insert into settings (key, value) values ($1, $2)", [row.key, JSON.stringify(row.value)]);
  await pool.query("delete from redirects where source like $1", [`/e2e-legacy-${RUN}%`]);
  await pool.query("delete from seo_audits where started_at >= $1", [STARTED]);
  await cleanup();
});

test("a meta description override for /what-we-do changes the served tag with no rebuild, and clearing it restores the original", async ({ browser, baseURL }) => {
  const before = await publicText(browser, `${baseURL}/what-we-do`);
  expect(before.status).toBe(200);
  const original = metaDescription(before.text);
  expect(original).toBeTruthy();

  const admin = await signedIn(browser, baseURL!);
  const description = `Override ${RUN}: AI, data and cloud engineering that ships.`;
  const save = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/overrides/save", { path: "/what-we-do", metaDescription: description });
  expect(save.status()).toBe(200);

  const changed = await until(() => publicText(browser, `${baseURL}/what-we-do`), (r) => metaDescription(r.text) === description, 15_000);
  console.log(`OVERRIDE EVIDENCE: /what-we-do description changed after ${changed.ms}ms; before="${original}" after="${metaDescription(changed.value.text)}"`);
  expect(metaDescription(changed.value.text)).toBe(description);
  // Open Graph and Twitter follow the override; the title does not change.
  expect(changed.value.text).toContain(`<meta property="og:description" content="${description}"`);
  expect(changed.value.text).toContain("<title>What We Do | DevelMo</title>");

  // The console shows the override and the SERP preview uses it.
  await admin.page.goto("/admin/seo/pages");
  await admin.page.getByLabel("Search routes").fill("/what-we-do");
  const row = admin.page.getByRole("row", { name: /^\/what-we-do What We Do/ });
  await expect(row.getByText("description")).toBeVisible();
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(admin.page.getByLabel("Search result preview")).toContainText(description);
  await expect(admin.page.getByText(`${description.length} / 155 characters`)).toBeVisible();
  await admin.page.getByRole("button", { name: "Clear override" }).click();
  await expect(admin.page.getByText("Override cleared")).toBeVisible();

  const restored = await until(() => publicText(browser, `${baseURL}/what-we-do`), (r) => metaDescription(r.text) === original, 15_000);
  expect(metaDescription(restored.value.text)).toBe(original);
  await admin.context.close();
});

test("a redirect created in the console 301s on the next request, keeps the query string, counts hits, and costs no database round trip per request", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!);
  const source = `/e2e-legacy-${RUN}`;

  // Loop and conflict detection.
  const loop = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/redirects/save", { source: "/what-we-do", destination: "/what-we-do/", code: 301, enabled: true, note: "" });
  expect(loop.status()).toBe(400);
  const conflict = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/redirects/check", { source: "/about", destination: "/who-we-are", code: 301, enabled: true, note: "" });
  expect(((await conflict.json()) as { check: { errors: string[] } }).check.errors.join(" ")).toMatch(/next\.config\.ts/);

  const create = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/redirects/save", { source, destination: "/what-we-do", code: 301, enabled: true, note: `e2e ${RUN}` });
  expect(create.status()).toBe(200);
  const { id } = (await create.json()) as { id: string };

  const live = await until(() => publicText(browser, `${baseURL}${source}?service=ai`), (r) => r.status === 301, 20_000, 250);
  console.log(`REDIRECT EVIDENCE: ${source} answered ${live.value.status} after ${live.ms}ms, location=${live.value.headers.location}`);
  expect(live.value.status).toBe(301);
  // Next writes same-origin redirects from the proxy as a relative Location.
  expect(live.value.headers.location.replace(baseURL!, "")).toBe("/what-we-do?service=ai");

  // No database round trip per public request: fire 200 redirected requests
  // and compare the database's own transaction counter before and after.
  // A lookup per request would add at least 200; the proxy refreshes its map
  // at most once per TTL through a cached route, so the delta stays at the
  // noise floor (this test's own reads, the batched hit flush, and the
  // asynchronous flush of Postgres statistics).
  await new Promise((r) => setTimeout(r, 1500));
  const before = await xactCount();
  const t0 = Date.now();
  const REQUESTS = 200;
  for (let i = 0; i < REQUESTS; i++) {
    const r = await publicText(browser, `${baseURL}${source}?n=${i}`);
    expect(r.status).toBe(301);
  }
  const elapsed = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 1500));
  const after = await xactCount();
  const delta = after - before;
  console.log(`DB MEASUREMENT: ${REQUESTS} redirected requests in ${elapsed}ms; pg_stat_database transactions before=${before} after=${after} delta=${delta} (a lookup per request would add at least ${REQUESTS})`);
  // The counter is database wide, so the strict bound only holds when no
  // other spec is running against the same database at the same time.
  // With parallel workers the figure is still printed for the record.
  // Noise floor: this test's own reads, one map refresh with the hit flush,
  // statistics lag and the tail of the previous test's writes; a lookup per
  // request would sit at 200 or more.
  if (test.info().config.workers === 1) expect(delta).toBeLessThan(40);
  else console.log(`DB MEASUREMENT: ${test.info().config.workers} workers, other specs share the counter; strict bound not asserted`);

  // Hits are batched and flushed with the next map refresh, which the next
  // public request after the TTL triggers, so keep a trickle of traffic
  // going while waiting.
  const hits = await until(
    async () => {
      await publicText(browser, `${baseURL}${source}`);
      return (await db().query<{ hits: number }>("select hits from redirects where id = $1", [id])).rows[0]?.hits ?? 0;
    },
    (h) => h >= REQUESTS + 1,
    40_000,
    1000,
  );
  console.log(`HIT COUNTER: ${hits.value} hits recorded after ${hits.ms}ms`);
  expect(hits.value).toBeGreaterThanOrEqual(REQUESTS + 1);

  // The console lists it; disabling it stops the redirect within the TTL.
  await admin.page.goto("/admin/seo/redirects");
  const row = admin.page.getByRole("row", { name: new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await expect(row).toBeVisible();
  await expect(row.getByText("/what-we-do")).toBeVisible();
  await row.getByRole("switch", { name: "On" }).click();
  await expect(admin.page.getByText("Redirect disabled")).toBeVisible();
  const off = await until(() => publicText(browser, `${baseURL}${source}`), (r) => r.status !== 301, 20_000, 250);
  expect(off.value.status).toBe(404);

  const del = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/redirects/delete", { id });
  expect(del.status()).toBe(200);
  await admin.context.close();
});

test("excluding a route removes it from sitemap.xml, /admin is never listed, and restoring the default brings it back", async ({ browser, baseURL }) => {
  const admin = await signedIn(browser, baseURL!);
  const initial = await publicText(browser, `${baseURL}/sitemap.xml`);
  expect(initial.status).toBe(200);
  expect(initial.text).toContain("<loc>https://develmo.com/cookies</loc>");
  expect(initial.text).not.toMatch(/develmo\.com\/admin/);
  expect(initial.text).not.toMatch(/develmo\.com\/api/);

  const exclude = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/overrides/sitemap", { path: "/cookies", sitemapInclude: false, sitemapChangefreq: null, sitemapPriority: null });
  expect(exclude.status()).toBe(200);
  const gone = await until(() => publicText(browser, `${baseURL}/sitemap.xml`), (r) => !r.text.includes("<loc>https://develmo.com/cookies</loc>"), 20_000);
  console.log(`SITEMAP EVIDENCE: /cookies left sitemap.xml after ${gone.ms}ms`);
  expect(gone.value.text).not.toContain("<loc>https://develmo.com/cookies</loc>");
  expect(gone.value.text).toContain("<loc>https://develmo.com/privacy</loc>");
  expect(gone.value.text).not.toMatch(/develmo\.com\/admin/);

  // A protected path cannot be forced in through the override API either.
  const forced = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/overrides/sitemap", { path: "/admin", sitemapInclude: true, sitemapChangefreq: null, sitemapPriority: null });
  expect(forced.status()).toBe(400);

  // The console shows the exclusion and "Regenerate now" rebuilds the file.
  await admin.page.goto("/admin/seo/sitemap");
  await admin.page.getByLabel("Search routes").fill("/cookies");
  await expect(admin.page.getByLabel("Sitemap inclusion for /cookies")).toHaveValue("exclude");
  await admin.page.getByRole("button", { name: "Regenerate now" }).click();
  await expect(admin.page.getByText("Sitemap regenerated")).toBeVisible({ timeout: 15_000 });
  await expect(admin.page.getByText(/Last generated \d/)).toBeVisible();

  const restore = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/overrides/sitemap", { path: "/cookies", sitemapInclude: null, sitemapChangefreq: null, sitemapPriority: null });
  expect(restore.status()).toBe(200);
  const back = await until(() => publicText(browser, `${baseURL}/sitemap.xml`), (r) => r.text.includes("<loc>https://develmo.com/cookies</loc>"), 20_000);
  expect(back.value.text).toContain("<loc>https://develmo.com/cookies</loc>");
  await admin.context.close();
});

test("robots.txt keeps /admin and /api/admin disallowed after editing through the console, and validation blocks a broken file", async ({ browser, baseURL }) => {
  const admin = await signedIn(browser, baseURL!);
  const original = await publicText(browser, `${baseURL}/robots.txt`);
  expect(original.status).toBe(200);
  expect(original.text).toContain("Disallow: /admin\n");
  expect(original.text).toContain("Disallow: /api/admin\n");

  // Structural errors are rejected before anything is saved.
  const bad = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/robots/save", { body: "Disallow: /x\nNoindex: /y\n" });
  expect(bad.status()).toBe(400);

  // Through the UI: a body that tries to allow the console and drops the disallows.
  await admin.page.goto("/admin/seo/robots");
  const editor = admin.page.getByLabel("robots.txt", { exact: true });
  await editor.fill(`User-agent: *\nAllow: /admin\nAllow: /api/admin\nAllow: /\nDisallow: /e2e-${RUN}\n`);
  const preview = admin.page.getByLabel("Rendered robots.txt");
  await expect(preview).toContainText("Disallow: /admin");
  await expect(preview).toContainText("Disallow: /api/admin");
  await expect(preview).not.toContainText("Allow: /admin");
  await admin.page.getByRole("button", { name: "Save robots.txt" }).click();
  await expect(admin.page.getByText("robots.txt saved")).toBeVisible();

  const served = await until(() => publicText(browser, `${baseURL}/robots.txt`), (r) => r.text.includes(`Disallow: /e2e-${RUN}`), 20_000);
  console.log(`ROBOTS EVIDENCE after edit:\n${served.value.text}`);
  expect(served.value.text).toContain(`Disallow: /e2e-${RUN}`);
  expect(served.value.text).toContain("Disallow: /admin\n");
  expect(served.value.text).toContain("Disallow: /api/admin\n");
  expect(served.value.text).not.toContain("Allow: /admin");
  expect(served.value.text).toContain("Sitemap: https://develmo.com/sitemap.xml");

  await admin.page.getByRole("button", { name: "Reset to default" }).click();
  await expect(admin.page.getByText("robots.txt reset")).toBeVisible();
  const reset = await until(() => publicText(browser, `${baseURL}/robots.txt`), (r) => r.text === original.text, 20_000);
  expect(reset.value.text).toBe(original.text);
  await admin.context.close();
});

test("structured data: edited Organization facts reach every page, FAQPage can be switched off per detail page, and the shape is validated", async ({ browser, baseURL }) => {
  const admin = await signedIn(browser, baseURL!);
  const home = await publicText(browser, `${baseURL}/`);
  expect(home.text).toContain('"@type":"Organization"');
  expect(home.text).toContain('"email":"info@develmo.com"');

  const invalid = await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/schema/save", { name: "DevelMo", email: "nope", description: "x", streetAddress: "a", addressLocality: "b", postalCode: "c", addressCountry: "GB", telephone: [], logo: "" });
  expect(invalid.status()).toBe(400);

  await admin.page.goto("/admin/seo/schema");
  await admin.page.getByLabel("Email").fill(`hello-${RUN}@develmo.com`);
  await expect(admin.page.getByLabel("Organization JSON-LD")).toContainText(`hello-${RUN}@develmo.com`);
  await admin.page.getByRole("button", { name: "Save structured data" }).click();
  await expect(admin.page.getByText("Structured data saved")).toBeVisible();
  const changed = await until(() => publicText(browser, `${baseURL}/`), (r) => r.text.includes(`"email":"hello-${RUN}@develmo.com"`), 20_000);
  expect(changed.value.text).toContain(`"email":"hello-${RUN}@develmo.com"`);
  expect(changed.value.text).toContain('"sameAs":["https://www.linkedin.com/company/develmo"');

  const detail = "/what-we-do/generative-ai-llm-integration";
  const withFaq = await publicText(browser, `${baseURL}${detail}`);
  expect(withFaq.text).toContain('"@type":"FAQPage"');
  await admin.page.getByRole("switch", { name: "Emitted" }).first().waitFor();
  const faqRow = admin.page.getByRole("row", { name: new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await faqRow.getByRole("switch").click();
  await expect(admin.page.getByText("FAQPage off")).toBeVisible();
  const withoutFaq = await until(() => publicText(browser, `${baseURL}${detail}`), (r) => !r.text.includes('"@type":"FAQPage"'), 20_000);
  expect(withoutFaq.value.text).not.toContain('"@type":"FAQPage"');
  expect(withoutFaq.value.text).toContain("Common questions");

  await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/schema/faq", { path: detail, enabled: true });
  await post(admin.request, baseURL!, admin.csrf, "/api/admin/seo/schema/reset", {});
  const restored = await until(() => publicText(browser, `${baseURL}/`), (r) => r.text.includes('"email":"info@develmo.com"'), 20_000);
  expect(restored.value.text).toContain('"email":"info@develmo.com"');
  await admin.context.close();
});

test("the audit crawler runs, stores its findings, and every SEO page renders without horizontal overflow", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const admin = await signedIn(browser, baseURL!);
  await admin.page.goto("/admin/seo/audit");
  await admin.page.getByRole("button", { name: "Run audit now" }).click();
  await expect(admin.page.getByText("Audit started")).toBeVisible();
  await expect(admin.page.getByText("Audit finished")).toBeVisible({ timeout: 360_000 });

  const run = (await db().query<{ id: string; status: string; routes_scanned: number; summary: Record<string, number>; origin: string }>("select id, status, routes_scanned, summary, origin from seo_audits where started_at >= $1 order by started_at desc limit 1", [STARTED])).rows[0];
  expect(run.status).toBe("finished");
  expect(run.routes_scanned).toBeGreaterThan(30);
  const findings = (await db().query<{ path: string; kind: string; detail: Record<string, unknown> }>("select path, kind, detail from seo_audit_findings where audit_id = $1 order by kind, path", [run.id])).rows;
  console.log(`AUDIT FINDINGS: ${run.routes_scanned} pages crawled at ${run.origin}; summary=${JSON.stringify(run.summary)}`);
  const byKind = new Map<string, { path: string; detail: Record<string, unknown> }[]>();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  for (const [kind, rows] of byKind) {
    console.log(`AUDIT ${kind} (${rows.length}): ${rows.slice(0, 12).map((r) => `${r.path}${kind === "broken_link" ? ` -> ${String(r.detail.target)} ${String(r.detail.status)}` : kind === "h1_count" ? ` (${String(r.detail.count)})` : kind === "overlength_description" ? ` (${String(r.detail.length)})` : kind === "missing_alt" ? ` (${String(r.detail.count)})` : ""}`).join(", ")}${rows.length > 12 ? ", ..." : ""}`);
  }

  await admin.page.goto(`/admin/seo/audit/${run.id}`);
  await expect(admin.page.getByRole("heading", { name: /^Run of / })).toBeVisible();
  await expect(admin.page.getByText(/pages crawled at/)).toBeVisible();

  const pages = ["/admin/seo", "/admin/seo/pages", "/admin/seo/redirects", "/admin/seo/sitemap", "/admin/seo/robots", "/admin/seo/schema", "/admin/seo/audit", `/admin/seo/audit/${run.id}`];
  for (const width of [360, 768, 1280]) {
    await admin.page.setViewportSize({ width, height: 900 });
    for (const path of pages) {
      await admin.page.goto(path);
      await admin.page.waitForLoadState("networkidle");
      const { scrollWidth, clientWidth } = await admin.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      console.log(`${width}px ${path}: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
      expect(scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(clientWidth);
    }
  }
  await admin.context.close();
});
