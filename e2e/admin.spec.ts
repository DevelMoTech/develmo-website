import { test, expect, type Browser } from "@playwright/test";
import { generate } from "otplib";
import {
  SESSION_COOKIE,
  apiLogin,
  cleanup,
  createInvite,
  createUser,
  csrfFor,
  securityEventCount,
  sessionIdsFor,
  uiLogin,
  uniqueEmail,
  uniqueIp,
} from "./helpers/admin";

// Each test gets its own browser context with its own client IP header so
// rate-limit windows never bleed between tests.
async function fresh(browser: Browser) {
  const ip = uniqueIp();
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  return { context, page, ip };
}

const PASSWORD = "e2e-correct-horse-battery";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await cleanup();
});

test("unauthenticated /admin/* redirects to login with next and returns there after login", async ({ browser }) => {
  const email = uniqueEmail("return");
  await createUser({ email, password: PASSWORD, role: "viewer" });
  const { context, page } = await fresh(browser);
  const resp = await page.goto("/admin/account");
  expect(resp?.url()).toContain("/admin/login?next=%2Fadmin%2Faccount");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await uiLogin(page, { email, password: PASSWORD });
  await page.waitForURL("**/admin/account");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E User");
  await context.close();
});

test("login success lands on /admin and the session cookie is __Host-, httpOnly, Secure, Lax", async ({ browser }) => {
  const email = uniqueEmail("login");
  await createUser({ email, password: PASSWORD, role: "editor" });
  const { context, page } = await fresh(browser);
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: PASSWORD });
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  const cookie = (await context.cookies()).find((c) => c.name === SESSION_COOKIE);
  expect(cookie).toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.path).toBe("/");
  expect(await securityEventCount("login_success", email)).toBe(1);
  await context.close();
});

test("login failure is one generic answer for unknown email and wrong password", async ({ browser, baseURL }) => {
  const email = uniqueEmail("generic");
  await createUser({ email, password: PASSWORD, role: "viewer" });
  const { context } = await fresh(browser);
  const wrong = await apiLogin(context.request, baseURL!, { email, password: "definitely-not-it" });
  const unknown = await apiLogin(context.request, baseURL!, { email: uniqueEmail("nobody"), password: "definitely-not-it" });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body).toEqual(unknown.body);
  expect(wrong.body.error).toBe("invalid_credentials");
  // The UI renders the same generic message.
  const page = await context.newPage();
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: "definitely-not-it" });
  await expect(page.locator(".adm-alert-error")).toHaveText("Invalid email or password.");
  expect(await securityEventCount("login_failed", email)).toBe(2);
  await context.close();
});

test("five failed logins from one IP are rate limited with 429 and a retry message", async ({ browser, baseURL }) => {
  const email = uniqueEmail("ratelimit");
  await createUser({ email, password: PASSWORD, role: "viewer" });
  const { context } = await fresh(browser);
  for (let i = 0; i < 5; i++) {
    const r = await apiLogin(context.request, baseURL!, { email, password: "wrong" });
    expect(r.status).toBe(401);
  }
  const limited = await apiLogin(context.request, baseURL!, { email, password: PASSWORD });
  expect(limited.status).toBe(429);
  expect(limited.body.error).toBe("rate_limited");
  expect(limited.body.retryAfter).toBeGreaterThan(0);
  const page = await context.newPage();
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: PASSWORD });
  await expect(page.locator(".adm-alert-error")).toContainText("Too many attempts");
  await context.close();
});

test("owner and admin get a TOTP challenge after the password", async ({ browser }) => {
  const email = uniqueEmail("mfa");
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  await createUser({ email, password: PASSWORD, role: "admin", totpSecret: secret });
  const { context, page } = await fresh(browser);
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: PASSWORD });
  await page.waitForURL("**/admin/mfa/verify**");
  // A half-authenticated session cannot reach the console.
  await page.goto("/admin/account");
  await page.waitForURL("**/admin/mfa/verify**");
  await page.getByLabel("6 digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".adm-alert-error")).toContainText("not accepted");
  await page.getByLabel("6 digit code").fill(await generate({ secret }));
  await page.getByRole("button", { name: "Verify" }).click();
  // The challenge remembered where the user was heading.
  await page.waitForURL("**/admin/account");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("E2E User");
  expect(await securityEventCount("mfa_success", email)).toBe(1);
  expect(await securityEventCount("mfa_failed", email)).toBe(1);
  await context.close();
});

test("a valid invite is redeemed once into a new account", async ({ browser }) => {
  const email = uniqueEmail("invite");
  const { token } = await createInvite({ email, role: "viewer" });
  const { context, page } = await fresh(browser);
  await page.goto(`/admin/signup?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Your name").fill("Invited Person");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Invited Person");
  // Second use of the same link is an error state, not a form.
  const again = await context.newPage();
  await again.goto(`/admin/signup?token=${encodeURIComponent(token)}`);
  await expect(again.getByRole("heading", { name: "Invitation already used" })).toBeVisible();
  await expect(again.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await context.close();
});

test("expired, malformed and missing invite tokens render an error state with no form", async ({ browser }) => {
  const email = uniqueEmail("expired");
  const { token } = await createInvite({ email, role: "editor", expiresInMs: -60_000 });
  const { context, page } = await fresh(browser);
  await page.goto(`/admin/signup?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Invitation expired" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await page.goto(`/admin/signup?token=${encodeURIComponent(token.slice(0, -3) + "xyz")}`);
  await expect(page.getByRole("heading", { name: "Invitation link not recognised" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await page.goto("/admin/signup");
  await expect(page.getByRole("heading", { name: "Invitation link missing" })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await context.close();
});

test("revoking a session takes effect on that session's next request", async ({ browser }) => {
  const email = uniqueEmail("revoke");
  await createUser({ email, password: PASSWORD, role: "editor" });
  const a = await fresh(browser);
  const b = await fresh(browser);
  for (const { page } of [a, b]) {
    await page.goto("/admin/login");
    await uiLogin(page, { email, password: PASSWORD });
    await page.waitForURL("**/admin");
  }
  const ids = await sessionIdsFor(email);
  expect(ids).toHaveLength(2);
  // B works right now.
  await b.page.goto("/admin/account");
  await expect(b.page.getByRole("heading", { level: 1 })).toHaveText("E2E User");
  // A revokes B from the sessions tab of the account page.
  await a.page.goto("/admin/account?tab=sessions");
  const rows = a.page.getByRole("row").filter({ hasNotText: "This device" }).filter({ has: a.page.getByRole("button", { name: "Revoke" }) });
  await expect(rows).toHaveCount(1);
  await rows.getByRole("button", { name: "Revoke" }).click();
  await expect(a.page.getByRole("status").last()).toContainText("Session revoked");
  // B's very next request is bounced to login.
  await b.page.goto("/admin/account");
  await b.page.waitForURL("**/admin/login**");
  await a.context.close();
  await b.context.close();
});

test("a Viewer with a valid session gets 403 from a mutating endpoint called by hand", async ({ browser, baseURL }) => {
  const email = uniqueEmail("viewer");
  await createUser({ email, password: PASSWORD, role: "viewer" });
  const { context } = await fresh(browser);
  const login = await apiLogin(context.request, baseURL!, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const res = await context.request.post(`${baseURL}/api/admin/users/invite`, {
    headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL! },
    data: { email: uniqueEmail("target"), role: "viewer" },
  });
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ ok: false, error: "forbidden" });
  expect(await securityEventCount("permission_denied", email)).toBe(1);
  await context.close();
});

test("mutating endpoints reject missing sessions and missing CSRF tokens", async ({ browser, baseURL }) => {
  const { context } = await fresh(browser);
  const csrf = await csrfFor(context.request, baseURL!);
  const noSession = await context.request.post(`${baseURL}/api/admin/users/invite`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL! },
    data: { email: uniqueEmail("x"), role: "viewer" },
  });
  expect(noSession.status()).toBe(401);
  const noCsrf = await context.request.post(`${baseURL}/api/admin/auth/login`, {
    headers: { "content-type": "application/json", origin: baseURL! },
    data: { email: "a@b.co", password: "x" },
  });
  expect(noCsrf.status()).toBe(403);
  expect((await noCsrf.json()).error).toBe("csrf");
  const badOrigin = await context.request.post(`${baseURL}/api/admin/auth/login`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: "https://evil.example" },
    data: { email: "a@b.co", password: "x" },
  });
  expect(badOrigin.status()).toBe(403);
  await context.close();
});

test("admin routes carry noindex, are disallowed in robots.txt and absent from the sitemap", async ({ request }) => {
  const admin = await request.get("/admin/login");
  expect(admin.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const api = await request.get("/api/admin/auth/login");
  expect(api.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toMatch(/Disallow: \/admin/);
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).not.toContain("/admin");
});
