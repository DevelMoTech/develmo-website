import { test, expect, type Browser, type Page } from "@playwright/test";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const WIDTHS = [360, 375, 414, 768, 1024, 1280, 1440];
const PAGES = ["/admin", "/admin/users", "/admin/account?tab=sessions", "/admin/audit", "/admin/posts", "/admin/submissions"];

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "viewer" | "owner" = "viewer") {
  const email = uniqueEmail("shell");
  await createUser({ email, password: PASSWORD, role, name: "Shell Tester" });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf };
}

async function setTheme(page: Page, csrf: string, theme: string) {
  const res = await page.request.post("/api/admin/account/theme", {
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: new URL(page.url() || "http://localhost").origin },
    data: { theme },
  });
  expect(res.status()).toBe(200);
}

async function overflow(page: Page) {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

test.afterAll(async () => {
  await cleanup();
});

for (const theme of ["develmo-light", "develmo-dark"]) {
  test(`no horizontal overflow across the matrix, ${theme}`, async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const { context, page, csrf } = await signedIn(browser, baseURL!);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/i.test(m.text())) consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto("/admin");
    await setTheme(page, csrf, theme);
    const lines: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: "load" });
        await expect(page.locator(".adm-root")).toHaveAttribute("data-admin-theme", theme);
        // Measure the settled page, not the streaming skeleton.
        await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });
        const { scroll, client } = await overflow(page);
        lines.push(`${theme} ${width}px ${path}: scrollWidth=${scroll} clientWidth=${client}`);
        expect(scroll, `${path} overflows at ${width}px (${theme})`).toBeLessThanOrEqual(client);
        // Exactly one H1 per page.
        expect(await page.locator("h1").count(), `${path} must have one h1`).toBe(1);
      }
    }
    console.log(lines.join("\n"));
    await context.close();
  });
}

test("the login page has no overflow at any width", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const lines: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/admin/login", { waitUntil: "load" });
    const { scroll, client } = await overflow(page);
    lines.push(`login ${width}px: scrollWidth=${scroll} clientWidth=${client}`);
    expect(scroll).toBeLessThanOrEqual(client);
  }
  console.log(lines.join("\n"));
  await context.close();
});

test("theme switches without a reload and persists across reload, cookie and database", async ({ browser, baseURL }) => {
  const { context, page, email } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  const root = page.locator(".adm-root");
  await expect(root).toHaveAttribute("data-admin-theme", "system");
  const urlBefore = page.url();
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.getByRole("menuitemradio", { name: /Midnight/ }).click();
  await expect(root).toHaveAttribute("data-admin-theme", "midnight");
  expect(page.url()).toBe(urlBefore);
  // Persisted: cookie mirror, database row, and the server render after reload.
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === "dm_admin_theme")?.value).toBe("midnight");
  await expect.poll(async () => (await db().query<{ theme_pref: string }>("select theme_pref from users where email = $1", [email])).rows[0]?.theme_pref).toBe("midnight");
  await page.reload();
  await expect(root).toHaveAttribute("data-admin-theme", "midnight");
  // The very first HTML byte already carries it (no flash).
  const html = await page.request.get("/admin").then((r) => r.text());
  expect(html).toContain('data-admin-theme="midnight"');
  // The public site's own theme is untouched.
  const pub = await page.request.get("/").then((r) => r.text());
  expect(pub).not.toContain("data-admin-theme");
  await context.close();
});

test("every theme renders the shell and the AA sanity probe passes on body text", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const { context, page, csrf } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  for (const theme of ["develmo-light", "develmo-dark", "midnight", "slate", "high-contrast", "system"]) {
    await setTheme(page, csrf, theme);
    await page.goto("/admin/users");
    await expect(page.locator(".adm-root")).toHaveAttribute("data-admin-theme", theme);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users");
    const ratio = await page.evaluate(() => {
      const lum = (c: string) => {
        const m = c.match(/\d+(\.\d+)?/g)!.map(Number);
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      const el = document.querySelector(".adm-card p")!;
      const cs = getComputedStyle(el);
      const card = getComputedStyle(el.closest(".adm-card")!);
      const l1 = lum(cs.color);
      const l2 = lum(card.backgroundColor);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(ratio, `${theme} muted text contrast`).toBeGreaterThanOrEqual(4.5);
  }
  await context.close();
});

test("the drawer closes on link click, outside click, Escape and route change", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/admin");
  const shell = page.locator(".adm-shell");
  const open = page.getByRole("button", { name: "Open menu" });

  // Link click.
  await open.click();
  await expect(shell).toHaveAttribute("data-drawer", "open");
  await page.locator("#adm-sidebar").getByRole("link", { name: "Users" }).click();
  await page.waitForURL("**/admin/users");
  await expect(shell).toHaveAttribute("data-drawer", "closed");

  // Outside click (the backdrop).
  await open.click();
  await expect(shell).toHaveAttribute("data-drawer", "open");
  await page.mouse.click(360, 400);
  await expect(shell).toHaveAttribute("data-drawer", "closed");

  // Escape returns focus to the hamburger.
  await open.click();
  await expect(shell).toHaveAttribute("data-drawer", "open");
  await page.keyboard.press("Escape");
  await expect(shell).toHaveAttribute("data-drawer", "closed");
  await expect(open).toBeFocused();

  // Route change from outside the drawer (browser back).
  await open.click();
  await expect(shell).toHaveAttribute("data-drawer", "open");
  await page.goBack();
  await page.waitForURL("**/admin");
  await expect(shell).toHaveAttribute("data-drawer", "closed");
  await context.close();
});

test("keyboard shortcuts: / focuses search, g then p opens posts, Escape leaves the field", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  await page.locator("body").click({ position: { x: 700, y: 500 } });
  await page.keyboard.press("/");
  await expect(page.locator("#adm-search")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#adm-search")).not.toBeFocused();
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await page.waitForURL("**/admin/posts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Posts");
  await context.close();
});

test("global search finds pages and records, sidebar collapses to icons", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  await page.locator("#adm-search").fill("audit");
  await expect(page.getByRole("option", { name: /Audit log/ })).toBeVisible();
  await page.locator("#adm-search").fill("cameras");
  await expect(page.getByRole("option", { name: /Turn existing cameras/ })).toBeVisible();
  await page.getByRole("option", { name: /Turn existing cameras/ }).click();
  await page.waitForURL("**/admin/posts?q=**");
  await expect(page.getByRole("cell", { name: /Turn existing cameras/ })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".adm-shell")).toHaveAttribute("data-collapsed", "true");
  await page.reload();
  await expect(page.locator(".adm-shell")).toHaveAttribute("data-collapsed", "true");
  await context.close();
});

test("dashboard tiles show database counts and every tile links somewhere real", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");
  const publishedPosts = Number((await db().query<{ n: string }>("select count(*)::text as n from posts where status = 'published'")).rows[0].n);
  const tile = page.locator(".adm-card-link", { hasText: "Posts" });
  await expect(tile.locator(".adm-tile-value")).toHaveText(String(publishedPosts));
  const hrefs = await page.locator(".adm-card-link").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(hrefs.length).toBeGreaterThanOrEqual(5);
  for (const href of hrefs) {
    const res = await page.request.get(href!);
    expect(res.status(), href!).toBe(200);
  }
  await context.close();
});

test("interactive controls are at least 44 by 44 CSS px at 360px", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/admin", "/admin/users", "/admin/audit"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const small = await page.evaluate(() => {
      const sel = ".adm-top button, .adm-btn, .adm-tab, .adm-pages a, .adm-iconbtn, .adm-menu-item, .adm-switch";
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.className.toString().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return out;
    });
    expect(small, `${path} has undersized targets: ${small.join(", ")}`).toEqual([]);
  }
  await context.close();
});
