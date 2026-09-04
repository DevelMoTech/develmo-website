import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const STARTED = new Date();

// The service the content test edits, and the string it edits into it.
const SERVICE_SLUG = "computer-vision-image-recognition";
const SERVICE_PATH = `/what-we-do/${SERVICE_SLUG}`;

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string) {
  const email = uniqueEmail("content-admin");
  await createUser({ email, password: PASSWORD, role: "admin", name: "E2E content admin", totpSecret: TOTP_SECRET });
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

async function fetchPage(browser: Browser, url: string, locale?: string) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const res = await ctx.request.get(url, { headers: locale ? { cookie: `locale=${locale}` } : undefined });
  const out = { status: res.status(), html: await res.text() };
  await ctx.close();
  return out;
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

// The FAQPage block the detail page emits, parsed back out of the HTML.
function faqLd(html: string): { "@type"?: string; mainEntity?: { "@type"?: string; name?: string; acceptedAnswer?: { text?: string } }[] } | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
      if (parsed && parsed["@type"] === "FAQPage") return parsed;
    } catch {
      // Not this one.
    }
  }
  return null;
}

// The service entry is edited by the first test, so it is snapshotted before
// anything runs and put back afterwards whatever happens. A retry then starts
// from the same state as the first attempt.
let serviceSnapshot: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const row = (await db().query<{ data: Record<string, unknown> }>("select data from content_entries where entity = 'service' and key = $1", [SERVICE_SLUG])).rows[0];
  serviceSnapshot = row?.data ?? null;
});

test.afterAll(async () => {
  const pool = db();
  if (serviceSnapshot) await pool.query("update content_entries set data = $1 where entity = 'service' and key = $2", [JSON.stringify(serviceSnapshot), SERVICE_SLUG]);
  await pool.query("delete from translations where updated_at >= $1", [STARTED]);
  await pool.query("delete from settings where key = 'navigation'");
  await cleanup();
});

test("editing a service reaches its public page with the FAQPage structured data still valid", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!);

  const before = await fetchPage(browser, `${baseURL}${SERVICE_PATH}`);
  expect(before.status).toBe(200);
  expect(faqLd(before.html), "the service page should already emit FAQPage").not.toBeNull();
  // Counted from the stored entry rather than from the page, which may still
  // be serving a cached render from before this test started.
  const beforeCount = ((serviceSnapshot?.faqs as unknown[] | undefined) ?? []).length;
  expect(beforeCount).toBeGreaterThan(0);

  // Read the entry the console is showing, edit two fields, and add an FAQ.
  const current = { data: serviceSnapshot! };
  expect(current.data, "the service should be seeded").toBeTruthy();
  const blurb = `Edited by the end to end test ${RUN}.`;
  const question = `Does the editor keep structured data valid, ${RUN}?`;
  const answer = "Yes. The form mirrors the typed shape, so the FAQ entries still become FAQPage JSON-LD.";
  const next = {
    ...current.data,
    blurb,
    faqs: [...((current.data.faqs as { q: string; a: string }[] | undefined) ?? []), { q: question, a: answer }],
  };

  const saved = await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/entry", { entity: "service", key: SERVICE_SLUG, data: next });
  expect(saved.status()).toBe(200);

  const after = await until(() => fetchPage(browser, `${baseURL}${SERVICE_PATH}`), (r) => r.html.includes(blurb), 20_000);
  console.log(`CONTENT EVIDENCE: the edited blurb reached ${SERVICE_PATH} after ${after.ms}ms`);
  expect(after.value.html).toContain(blurb);

  const afterLd = faqLd(after.value.html);
  expect(afterLd, "FAQPage must still be emitted after the edit").not.toBeNull();
  expect(afterLd!["@type"]).toBe("FAQPage");
  expect(afterLd!.mainEntity).toHaveLength(beforeCount + 1);
  const added = afterLd!.mainEntity!.find((e) => e.name === question);
  expect(added, "the new FAQ should appear in the structured data").toBeTruthy();
  expect(added!["@type"]).toBe("Question");
  expect(added!.acceptedAnswer?.text).toBe(answer);
  // Every entry is still well formed, which is what the 31 detail pages need.
  for (const entry of afterLd!.mainEntity!) {
    expect(entry["@type"]).toBe("Question");
    expect(typeof entry.name).toBe("string");
    expect((entry.name ?? "").length).toBeGreaterThan(0);
    expect((entry.acceptedAnswer?.text ?? "").length).toBeGreaterThan(0);
  }
  console.log(`CONTENT EVIDENCE: FAQPage still valid with ${afterLd!.mainEntity!.length} questions, all with a name and an answer`);

  // A payload that breaks the shape is refused rather than stored.
  const bad = await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/entry", { entity: "service", key: SERVICE_SLUG, data: { ...next, faqs: [{ q: "Half an entry", a: "" }] } });
  expect(bad.status()).toBe(400);
  const stillGood = await fetchPage(browser, `${baseURL}${SERVICE_PATH}`);
  expect(faqLd(stillGood.html)!.mainEntity).toHaveLength(beforeCount + 1);
  console.log("CONTENT EVIDENCE: an FAQ with an empty answer was refused, and the stored entry was left alone");

  // Put the entry back the way it was.
  await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/entry", { entity: "service", key: SERVICE_SLUG, data: current.data });
  await admin.context.close();
});

test("a translation edited in the console renders on the public site under locale=fr", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!);

  // A string the French dictionary already translates, so the change is
  // visible as a change rather than as a first translation.
  const key = "Book a Free Consultation";
  const override = `Réservez votre appel ${RUN}`;

  const before = await fetchPage(browser, `${baseURL}/`, "fr");
  expect(before.html).not.toContain(override);

  const saved = await post(admin.request, baseURL!, admin.csrf, "/api/admin/translations/save", { locale: "fr", key, value: override });
  expect(saved.status()).toBe(200);

  const after = await until(() => fetchPage(browser, `${baseURL}/`, "fr"), (r) => r.html.includes(override), 20_000);
  console.log(`TRANSLATION EVIDENCE: the override reached the French home page after ${after.ms}ms`);
  expect(after.value.html).toContain(override);
  // Only French changed.
  expect((await fetchPage(browser, `${baseURL}/`, "es")).html).not.toContain(override);
  expect((await fetchPage(browser, `${baseURL}/`)).html).not.toContain(override);

  // The grid shows it as edited here, and clearing restores the file value.
  await admin.page.goto(`/admin/translations?locale=fr&view=overridden&q=${encodeURIComponent(key)}`);
  await expect(admin.page.getByText(override)).toBeVisible();
  await expect(admin.page.getByText("edited here").first()).toBeVisible();

  const cleared = await post(admin.request, baseURL!, admin.csrf, "/api/admin/translations/save", { locale: "fr", key, value: "" });
  expect(cleared.status()).toBe(200);
  const restored = await until(() => fetchPage(browser, `${baseURL}/`, "fr"), (r) => !r.html.includes(override), 20_000);
  expect(restored.value.html).not.toContain(override);
  console.log("TRANSLATION EVIDENCE: clearing the override restored the value from the file");
  await admin.context.close();
});

test("the navigation guard refuses a menu containing a link to a route that does not resolve", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await signedIn(browser, baseURL!);
  const good = {
    primary: [{ label: "What We Do", href: "/what-we-do" }, { label: "Who We Help", href: "/who-we-help" }],
    company: [{ label: "Contact", href: "/contact-develmo" }],
  };

  // A real menu saves.
  expect((await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/navigation", good)).status()).toBe(200);

  // One dead link is enough to refuse the whole menu.
  const dead = { ...good, company: [...good.company, { label: "Nowhere", href: `/does-not-exist-${RUN}` }] };
  const refused = await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/navigation", dead);
  const body = (await refused.json()) as { error: string; dead: { list: string; index: number; href: string; label: string }[] };
  console.log(`NAV GUARD: answered ${refused.status()} ${body.error}; dead=${JSON.stringify(body.dead)}`);
  expect(refused.status()).toBe(400);
  expect(body.error).toBe("dead_links");
  expect(body.dead).toHaveLength(1);
  expect(body.dead[0].href).toBe(`/does-not-exist-${RUN}`);

  // Nothing was stored: the saved menu is still the good one.
  const stored = (await db().query<{ value: { company: { href: string }[] } }>("select value from settings where key = 'navigation'")).rows[0];
  expect(stored.value.company.map((c) => c.href)).toEqual(["/contact-develmo"]);

  // Links off this site are accepted as typed.
  const external = { ...good, company: [...good.company, { label: "Email", href: "mailto:info@develmo.com" }, { label: "LinkedIn", href: "https://www.linkedin.com/company/develmo" }] };
  expect((await post(admin.request, baseURL!, admin.csrf, "/api/admin/content/navigation", external)).status()).toBe(200);

  // The editor marks a dead link before the save is even attempted.
  await admin.page.goto("/admin/content/navigation");
  const hrefField = admin.page.getByLabel("Link").first();
  await hrefField.fill(`/definitely-not-a-page-${RUN}`);
  await expect(admin.page.getByText("No page answers this path. Saving is refused until it does.")).toBeVisible();
  console.log("NAV GUARD: the editor flags a dead path as it is typed, and the server refuses it independently");
  await admin.context.close();
});

test("locale leak check: zero residual English on ar and fr across the public pages", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const admin = await signedIn(browser, baseURL!);
  const routes = ["/", "/what-we-do", SERVICE_PATH, "/who-we-help", "/our-products", "/our-blogs", "/contact-develmo", "/jobs"];

  const res = await post(admin.request, baseURL!, admin.csrf, "/api/admin/translations/leak-check", { routes, locales: ["ar", "fr"] });
  expect(res.status()).toBe(200);
  const { results } = (await res.json()) as { results: { route: string; locale: string; status: number; lang: string | null; dir: string | null; examined: number; leaks: { key: string; context: string }[] }[] };

  console.log("LEAK CHECK: head and every script block stripped, so the RSC flight payload is not mistaken for visible text");
  for (const r of results) {
    console.log(`${r.leaks.length === 0 ? "PASS" : "FAIL"} ${r.locale} ${r.route.padEnd(46)} status=${r.status} lang=${r.lang} dir=${r.dir ?? "ltr"} examined=${r.examined} leaks=${r.leaks.length}`);
    for (const l of r.leaks) console.log(`      - "${l.key}"  ...${l.context}...`);
  }
  const total = results.reduce((n, r) => n + r.leaks.length, 0);
  console.log(total === 0 ? `LEAK CHECK: ZERO residual English across ${results.length} page and locale pairs` : `LEAK CHECK: ${total} leaked strings`);

  expect(results).toHaveLength(routes.length * 2);
  for (const r of results) {
    expect(r.status, `${r.locale} ${r.route}`).toBe(200);
    // A page that failed to render would report no leaks for the wrong reason.
    expect(r.examined, `${r.locale} ${r.route} rendered no text`).toBeGreaterThan(1000);
    expect(r.leaks, `${r.locale} ${r.route}`).toEqual([]);
    expect(r.lang).toBe(r.locale);
    expect(r.dir).toBe(r.locale === "ar" ? "rtl" : "ltr");
  }
  await admin.context.close();
});

test("the content console renders, and every page fits its viewport", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const admin = await signedIn(browser, baseURL!);

  await admin.page.goto("/admin/content/services");
  await expect(admin.page.getByRole("row", { name: new RegExp(SERVICE_SLUG) })).toBeVisible();
  await admin.page.goto("/admin/translations");
  await expect(admin.page.getByText(/% covered/).first()).toBeVisible();

  const pages = ["/admin/content", "/admin/content/services", "/admin/content/industries", "/admin/content/products", "/admin/content/about", "/admin/content/site", "/admin/content/navigation", "/admin/translations"];
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
