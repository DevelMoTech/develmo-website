// Shared plumbing for the phase 11 sweeps. Every admin route is reachable
// only from the right kind of session, so the sweep builds four of them and
// visits each route from the one that actually renders it.

import { generate } from "otplib";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { apiLogin, createUser, uniqueEmail, uniqueIp } from "./admin";
import { allShellRoutes, MFA_ENROL_ROUTES, MFA_VERIFY_ROUTES, PUBLIC_ADMIN_ROUTES, type Fixtures } from "./routes";
import { THEME_COOKIE, type ThemeId } from "../../src/app/(admin)/_lib/theme";

export const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const PASSWORD = "e2e-correct-horse-battery";

export type Target = { route: string; page: Page; kind: "anon" | "enrol" | "verify" | "shell" };

// Owner and Admin must clear the second factor before a session reaches the
// shell. Skipping that step is not a login failure: every admin route quietly
// answers with a redirect stub to /admin/mfa/enrol, and a sweep would then
// measure that one page dozens of times and call the surface clean.
// Playwright applies extraHTTPHeaders to every request a context makes,
// including cross-origin ones. Sending x-forwarded-for to gstatic.com turns
// the reCAPTCHA script into a CORS preflight Google does not allow, so the
// script fails and the page logs console errors a real browser would never
// see. The header exists only to give each context its own client address for
// the rate limiter, so scope it to the site under test.
async function clientIp(context: BrowserContext, baseURL: string, ip: string): Promise<void> {
  const origin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (!req.url().startsWith(origin)) return route.continue();
    return route.continue({ headers: { ...req.headers(), "x-forwarded-for": ip } });
  });
}

export async function signedInOwner(browser: Browser, baseURL: string, prefix: string) {
  const email = uniqueEmail(prefix);
  await createUser({ email, password: PASSWORD, role: "owner", name: "Sweep Owner", totpSecret: TOTP_SECRET });
  const context = await browser.newContext();
  await clientIp(context, baseURL, uniqueIp());
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status, "password step").toBe(200);
  const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
    headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL },
    data: { code: await generate({ secret: TOTP_SECRET }) },
  });
  expect(verify.status(), "second factor step").toBe(200);
  const page = await context.newPage();
  return { context, page, csrf: login.csrf, email };
}

// A session that has given the password but not the second factor. This is the
// only state in which the enrol and verify pages render.
async function halfSignedIn(browser: Browser, baseURL: string, prefix: string, withSecret: boolean) {
  const email = uniqueEmail(prefix);
  await createUser({ email, password: PASSWORD, role: "owner", name: "Sweep Pending", totpSecret: withSecret ? TOTP_SECRET : undefined });
  const context = await browser.newContext();
  await clientIp(context, baseURL, uniqueIp());
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { context, page: await context.newPage(), csrf: login.csrf };
}

export type Sweep = {
  targets: Target[];
  session: Page;
  csrf: string;
  setTheme: (theme: ThemeId | string) => Promise<void>;
  close: () => Promise<void>;
};

export async function openSweep(browser: Browser, baseURL: string, prefix: string, fixtures: Fixtures, viewport: { width: number; height: number }): Promise<Sweep> {
  const owner = await signedInOwner(browser, baseURL, prefix);
  const enrol = await halfSignedIn(browser, baseURL, `${prefix}-enrol`, false);
  const verify = await halfSignedIn(browser, baseURL, `${prefix}-verify`, true);
  const anonContext = await browser.newContext();
  await clientIp(anonContext, baseURL, uniqueIp());
  const anon = await anonContext.newPage();

  const contexts: BrowserContext[] = [owner.context, enrol.context, verify.context, anonContext];
  const allPages = [owner.page, enrol.page, verify.page, anon];
  for (const p of allPages) await p.setViewportSize(viewport);

  const targets: Target[] = [
    ...PUBLIC_ADMIN_ROUTES.map((route) => ({ route, page: anon, kind: "anon" as const })),
    ...MFA_ENROL_ROUTES.map((route) => ({ route, page: enrol.page, kind: "enrol" as const })),
    ...MFA_VERIFY_ROUTES.map((route) => ({ route, page: verify.page, kind: "verify" as const })),
    ...allShellRoutes(fixtures).map((route) => ({ route, page: owner.page, kind: "shell" as const })),
  ];

  return {
    targets,
    session: owner.page,
    csrf: owner.csrf,
    // The signed-in pages read the theme from the account; the pages without a
    // session read the cookie, so both have to be set.
    setTheme: async (theme) => {
      const res = await owner.page.request.post(`${baseURL}/api/admin/account/theme`, {
        headers: { "x-csrf-token": owner.csrf, "content-type": "application/json", origin: baseURL },
        data: { theme },
      });
      expect(res.status()).toBe(200);
      for (const ctx of [enrol.context, verify.context, anonContext]) {
        await ctx.clearCookies({ name: THEME_COOKIE });
        await ctx.addCookies([{ name: THEME_COOKIE, value: String(theme), url: baseURL }]);
      }
    },
    close: async () => {
      for (const ctx of contexts) await ctx.close();
    },
  };
}

// A route that redirects on arrival aborts the navigation Playwright waits on
// and tears down the execution context mid-read. Settle first, then measure.
export async function visit(page: Page, route: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("load", { timeout: 15_000 });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 4 || !/ERR_ABORTED|Execution context was destroyed|navigation/.test(msg)) throw err;
      await page.waitForTimeout(500);
    }
  }
}

// React hydration replaces DOM nodes after the load event. A tool that walks
// the tree while that is happening reads a half-swapped page: axe reported
// "no level-one heading" on pages that demonstrably had one. Wait until the
// DOM stops changing, then look.
export async function waitForQuietDom(page: Page, quietMs = 300, maxMs = 6000): Promise<void> {
  await page
    .evaluate(
      ([quiet, max]) =>
        new Promise<void>((resolve) => {
          let timer = 0;
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = window.setTimeout(done, quiet);
          });
          const done = () => {
            observer.disconnect();
            clearTimeout(timer);
            clearTimeout(cap);
            resolve();
          };
          const cap = window.setTimeout(done, max);
          timer = window.setTimeout(done, quiet);
          observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
        }),
      [quietMs, maxMs] as const,
    )
    .catch(() => {});
}

export async function settled<T>(page: Page, route: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 3 || !msg.includes("Execution context was destroyed")) throw err;
      await page.waitForTimeout(400);
      await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    }
  }
  throw new Error(`${route} never settled`);
}

export type PageState = { redirect: boolean; heading: string; path: string; title: string };

export async function readState(page: Page, route: string): Promise<PageState> {
  return settled(page, route, () =>
    page.evaluate(() => ({
      redirect: !!document.querySelector("#__next-page-redirect") || !!document.querySelector('meta[http-equiv="refresh"]'),
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      path: location.pathname,
      title: document.title,
    })),
  );
}

// Every sweep calls this first. Without it a sweep can pass by measuring the
// same redirect stub on every route.
export async function assertRoutesRender(targets: Target[]): Promise<string[]> {
  const bad: string[] = [];
  const seen: string[] = [];
  for (const t of targets) {
    await visit(t.page, t.route);
    await waitForQuietDom(t.page);
    const s = await readState(t.page, t.route);
    if (s.redirect) bad.push(`${t.route} (${t.kind}) served a redirect stub, not the page`);
    else if (s.path !== t.route) bad.push(`${t.route} (${t.kind}) redirected to ${s.path}`);
    else if (s.heading.length === 0) bad.push(`${t.route} (${t.kind}) rendered no h1`);
    else seen.push(`${t.route} -> "${s.heading}"`);
  }
  expect(bad, bad.join("\n")).toEqual([]);
  return seen;
}
