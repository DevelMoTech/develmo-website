import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const STARTED = new Date();

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "admin" | "editor" = "admin") {
  const email = uniqueEmail(`perf-${role}`);
  const mfa = role === "admin";
  await createUser({ email, password: PASSWORD, role, name: `E2E perf ${role}`, totpSecret: mfa ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  if (mfa) {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, { headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL }, data: { code: await generate({ secret: TOTP_SECRET }) } });
    expect(verify.status()).toBe(200);
  }
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf, request: context.request };
}

function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: Record<string, unknown>) {
  return request.post(`${baseURL}${path}`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data });
}

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs: number, everyMs = 400): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (ok(value)) return { value, ms: Date.now() - start };
    if (Date.now() - start > timeoutMs) return { value, ms: Date.now() - start };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

const countVitals = async (route: string) =>
  Number((await db().query<{ n: string }>("select count(*)::text as n from web_vitals where route = $1 and created_at >= $2", [route, STARTED])).rows[0].n);

test.afterAll(async () => {
  const pool = db();
  await pool.query("delete from web_vitals where created_at >= $1", [STARTED]);
  await pool.query("delete from psi_snapshots where run_at >= $1", [STARTED]);
  await pool.query("delete from build_stats where recorded_at >= $1", [STARTED]);
  await pool.query("delete from settings where key = 'media'");
  await cleanup();
});

test("visiting three public pages reports vitals attributed to the right route, under the unchanged CSP", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  // The policy the site already had. If reporting needed a change, the
  // beacon would be refused and no row would arrive.
  const head = await (await browser.newContext()).request.get(`${baseURL}/`);
  const csp = head.headers()["content-security-policy"];
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("vitals");
  console.log(`CSP EVIDENCE: connect-src is "${csp.split(";").find((d) => d.trim().startsWith("connect-src"))?.trim()}"; the reporter posts same origin, so it needs nothing added`);

  const routes = ["/", "/what-we-do", "/contact-develmo"];
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const violations: string[] = [];
  const page: Page = await context.newPage();
  page.on("console", (m) => {
    const text = m.text();
    if (/content security policy|refused to connect/i.test(text)) violations.push(text);
  });

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // The reporter batches and sends when the page is hidden, which is what
    // a real visitor's browser does on navigate away or tab switch.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pagehide"));
    });
    await page.waitForTimeout(1200);
  }
  await context.close();

  expect(violations, `CSP violations in the console: ${violations.join(" | ")}`).toEqual([]);

  const counts: Record<string, number> = {};
  for (const route of routes) {
    const got = await until(() => countVitals(route), (n) => n > 0, 20_000);
    counts[route] = got.value;
  }
  console.log(`VITALS EVIDENCE: rows by route ${JSON.stringify(counts)}`);
  for (const route of routes) expect(counts[route], `no vitals rows for ${route}`).toBeGreaterThan(0);

  // Each row carries a metric this site reports and a device class.
  const sample = await db().query<{ route: string; metric: string; value: number; device_class: string }>(
    "select route, metric, value, device_class from web_vitals where created_at >= $1 order by id limit 20",
    [STARTED],
  );
  console.log(`VITALS EVIDENCE: sample rows ${sample.rows.slice(0, 6).map((r) => `${r.route} ${r.metric}=${Math.round(r.value)} (${r.device_class})`).join("; ")}`);
  for (const r of sample.rows) {
    expect(["LCP", "INP", "CLS", "FCP", "TTFB"]).toContain(r.metric);
    expect(["mobile", "desktop"]).toContain(r.device_class);
    expect(routes).toContain(r.route);
  }

  // The console shows them, split by route and device class.
  const admin = await signedIn(browser, baseURL!, "admin");
  await admin.page.goto("/admin/performance");
  // Anchored on the device column, so the dynamic pattern route that other
  // specs' visits produce (/what-we-do/[slug]) is not also matched.
  await expect(admin.page.getByRole("row", { name: /^\/what-we-do (mobile|desktop) / })).toBeVisible();
  await expect(admin.page.getByText(/samples across \d+ routes?/)).toBeVisible();
  await admin.context.close();
});

test("a manual revalidate updates a stale public page", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!, "admin");
  const slug = `e2e-perf-${RUN}`;
  const original = `E2E perf ${RUN} original`;
  const changed = `E2E perf ${RUN} changed`;

  // A published post, then read the public page so it is cached.
  await db().query("insert into posts (type, slug, title, status, published_at, body_md, excerpt) values ('blog', $1, $2, 'published', now(), 'Body.', 'Excerpt.')", [slug, original]);
  const revalidatePosts = await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/revalidate-tag", { tag: "posts" });
  expect(revalidatePosts.status()).toBe(200);
  const first = await until(async () => (await (await browser.newContext()).request.get(`${baseURL}/our-blogs/${slug}`)).text(), (t) => t.includes(original), 20_000);
  expect(first.value).toContain(original);

  // Change it behind the cache's back, so nothing has busted the tag.
  await db().query("update posts set title = $1 where slug = $2", [changed, slug]);
  const stale = await (await browser.newContext()).request.get(`${baseURL}/our-blogs/${slug}`);
  const staleBody = await stale.text();
  const wasStale = staleBody.includes(original) && !staleBody.includes(changed);
  console.log(`CACHE EVIDENCE: after editing the row directly, the public page still showed the old title: ${wasStale}`);

  // The manual escape hatch.
  const bust = await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/revalidate-tag", { tag: "posts" });
  expect(bust.status()).toBe(200);
  const fresh = await until(async () => (await (await browser.newContext()).request.get(`${baseURL}/our-blogs/${slug}`)).text(), (t) => t.includes(changed), 25_000);
  console.log(`CACHE EVIDENCE: after "Revalidate posts" the page served the new title after ${fresh.ms}ms`);
  expect(fresh.value).toContain(changed);
  expect(fresh.value).not.toContain(original);

  // Revalidating a path works too, and the console records both in the trail.
  const byPath = await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/revalidate-path", { path: "/our-blogs", type: "page" });
  expect(byPath.status()).toBe(200);
  const trail = await db().query<{ n: string }>("select count(*)::text as n from audit_log where action in ('performance.revalidate.tag','performance.revalidate.path') and created_at >= $1", [STARTED]);
  expect(Number(trail.rows[0].n)).toBeGreaterThanOrEqual(3);

  await admin.page.goto("/admin/performance/cache");
  await expect(admin.page.getByRole("row", { name: /^posts/ }).getByText("performance.revalidate.tag")).toBeVisible();

  await db().query("delete from posts where slug = $1", [slug]);
  await admin.context.close();
});

test("the asset report lists the three hero videos with their real byte sizes and a data cost", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await signedIn(browser, baseURL!, "admin");
  await admin.page.goto("/admin/performance/assets");

  // The real sizes on disk, which the report must match exactly.
  const expected: Record<string, number> = { "/hero-1.mp4": 1_001_771, "/hero-2.mp4": 561_996, "/hero-3.mp4": 1_052_957 };
  for (const [path, bytes] of Object.entries(expected)) {
    const row = admin.page.getByRole("row", { name: new RegExp(path.replace(/[.]/g, "\\.")) }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText(bytes.toLocaleString("en-GB"), { exact: false })).toBeVisible();
  }
  const total = Object.values(expected).reduce((a, b) => a + b, 0);
  await expect(admin.page.getByText(total.toLocaleString("en-GB"), { exact: false }).first()).toBeVisible();
  await expect(admin.page.getByText(/Mobile data/)).toBeVisible();
  const cost = await admin.page.getByRole("definition").filter({ hasText: "pay as you go" }).first().innerText();
  console.log(`ASSET EVIDENCE: hero videos ${Object.entries(expected).map(([p, b]) => `${p}=${b.toLocaleString("en-GB")} B`).join(", ")}, total ${total.toLocaleString("en-GB")} B`);
  console.log(`ASSET EVIDENCE: ${cost.replace(/\s+/g, " ").trim()}`);

  // Real, not made up: the sizes match what the server actually serves.
  for (const path of Object.keys(expected)) {
    const res = await admin.request.get(`${baseURL}${path}`);
    expect(Number(res.headers()["content-length"]), `${path} served size`).toBe(expected[path]);
  }
  await admin.context.close();
});

test("the hero slider still auto advances and still plays only the active clip", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/`);

  const state = () =>
    page.evaluate(() => {
      const vids = [...document.querySelectorAll<HTMLVideoElement>(".hero-vid")];
      return {
        count: vids.length,
        on: vids.map((v) => v.classList.contains("on")),
        paused: vids.map((v) => v.paused),
        name: document.querySelector(".hn-name")?.textContent ?? "",
        dots: [...document.querySelectorAll<HTMLElement>(".hn-dots button")].map((b) => b.classList.contains("on")),
      };
    });

  await expect(page.locator(".hero-vid")).toHaveCount(3);
  const first = await until(state, (s) => s.on[0] === true && s.paused[0] === false, 20_000, 250);
  console.log(`HERO EVIDENCE: on mount, active=${first.value.on.indexOf(true)} "${first.value.name}", paused=[${first.value.paused.join(", ")}]`);
  expect(first.value.on).toEqual([true, false, false]);
  // Only the active clip plays; the other two are paused.
  expect(first.value.paused[0]).toBe(false);
  expect(first.value.paused[1]).toBe(true);
  expect(first.value.paused[2]).toBe(true);
  expect(first.value.dots).toEqual([true, false, false]);

  // Auto advance: the interval is seven seconds, so the second clip takes
  // over on its own with no interaction at all.
  const second = await until(state, (s) => s.on[1] === true, 20_000, 250);
  console.log(`HERO EVIDENCE: after ${second.ms}ms with no interaction, active=${second.value.on.indexOf(true)} "${second.value.name}", paused=[${second.value.paused.join(", ")}]`);
  expect(second.value.on).toEqual([false, true, false]);
  expect(second.value.paused[1]).toBe(false);
  expect(second.value.paused[0]).toBe(true);
  expect(second.value.paused[2]).toBe(true);
  expect(second.value.dots).toEqual([false, true, false]);

  // And on to the third, so it cycles rather than stopping at two.
  const third = await until(state, (s) => s.on[2] === true, 20_000, 250);
  console.log(`HERO EVIDENCE: after a further ${third.ms}ms, active=${third.value.on.indexOf(true)} "${third.value.name}", paused=[${third.value.paused.join(", ")}]`);
  expect(third.value.on).toEqual([false, false, true]);
  expect(third.value.paused[2]).toBe(false);
  expect(third.value.paused.filter((p) => p === true)).toHaveLength(2);

  // A dot still selects a clip directly.
  await page.locator(".hn-dots button").first().click();
  const picked = await until(state, (s) => s.on[0] === true, 10_000, 200);
  expect(picked.value.paused[0]).toBe(false);
  await context.close();
});

test("the poster only setting holds the video back, and reduced motion wins regardless", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!, "admin");

  // Reduced motion, with the settings at their defaults: no clip plays,
  // but the slider still advances so the hero reads the same.
  const reduced = await browser.newContext({ reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const rPage = await reduced.newPage();
  await rPage.goto(`${baseURL}/`);
  await rPage.waitForTimeout(1500);
  const rState = await rPage.evaluate(() => {
    const vids = [...document.querySelectorAll<HTMLVideoElement>(".hero-vid")];
    return { paused: vids.map((v) => v.paused), preload: vids.map((v) => v.getAttribute("preload")) };
  });
  console.log(`HERO EVIDENCE: with prefers-reduced-motion, paused=[${rState.paused.join(", ")}], preload=[${rState.preload.join(", ")}]`);
  expect(rState.paused.every((p) => p)).toBe(true);
  expect(rState.preload.every((p) => p === "none")).toBe(true);
  // The slider still advances, which the brief requires to keep working.
  const advanced = await until(
    () => rPage.evaluate(() => [...document.querySelectorAll(".hero-vid")].findIndex((v) => v.classList.contains("on"))),
    (i) => i > 0,
    20_000,
    250,
  );
  expect(advanced.value).toBeGreaterThan(0);
  await reduced.close();

  // Poster only below 900px: a narrow viewport gets the poster, a wide one
  // still gets the video.
  const saved = await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/media", { heroAutoplayMobile: true, posterOnlyMaxWidth: 900 });
  expect(saved.status()).toBe(200);

  const narrow = await browser.newContext({ viewport: { width: 480, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const nPage = await narrow.newPage();
  const gotSetting = await until(
    async () => {
      await nPage.goto(`${baseURL}/`);
      await nPage.waitForTimeout(1200);
      return nPage.evaluate(() => [...document.querySelectorAll<HTMLVideoElement>(".hero-vid")].every((v) => v.paused));
    },
    (allPaused) => allPaused,
    20_000,
    1_000,
  );
  console.log(`HERO EVIDENCE: with poster-only below 900px, a 480px viewport left every clip paused: ${gotSetting.value}`);
  expect(gotSetting.value).toBe(true);
  await narrow.close();

  const wide = await browser.newContext({ viewport: { width: 1400, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const wPage = await wide.newPage();
  await wPage.goto(`${baseURL}/`);
  const playing = await until(
    () => wPage.evaluate(() => document.querySelector<HTMLVideoElement>(".hero-vid.on")?.paused ?? true),
    (paused) => paused === false,
    20_000,
    250,
  );
  console.log(`HERO EVIDENCE: at 1400px the active clip still plays: ${!playing.value}`);
  expect(playing.value).toBe(false);
  await wide.close();

  // Back to the defaults so the rest of the suite sees the shipped behaviour.
  expect((await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/media", { heroAutoplayMobile: true, posterOnlyMaxWidth: 0 })).status()).toBe(200);
  await admin.context.close();
});

test("build stats record real per route sizes, and every performance page fits its viewport", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const admin = await signedIn(browser, baseURL!, "admin");

  const recorded = await post(admin.request, baseURL!, admin.csrf, "/api/admin/performance/build", {});
  const body = (await recorded.json()) as { ok: boolean; routes?: number; detail?: string };
  console.log(`BUILD EVIDENCE: record answered ${recorded.status()} ${JSON.stringify(body)}`);
  expect(recorded.status()).toBe(200);
  expect(body.routes).toBeGreaterThan(20);

  await admin.page.goto("/admin/performance/build");
  await expect(admin.page.getByText(/Shared client runtime/)).toBeVisible();
  const home = admin.page.getByRole("row", { name: /^\/ / }).first();
  await expect(home).toBeVisible();

  // Editors can read but not record.
  const editor = await signedIn(browser, baseURL!, "editor");
  const denied = await post(editor.request, baseURL!, editor.csrf, "/api/admin/performance/build", {});
  expect(denied.status()).toBe(403);
  await editor.context.close();

  const pages = ["/admin/performance", "/admin/performance/psi", "/admin/performance/assets", "/admin/performance/build", "/admin/performance/cache", "/admin/performance/media"];
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
