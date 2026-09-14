import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

// The second-factor policy (Security, Authentication): who is made to enrol,
// who is asked, and that "off" lets enrolled people in on the password. The
// setting is global to the console, so this file runs serially and puts the
// default back when it is done.

const PASSWORD = "e2e-correct-horse-battery";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

test.describe.configure({ mode: "serial" });

// The policy is read through the shared data cache, so the default is put
// back through the API (which expires the cache), never by deleting the row
// behind its back. The row is then removed so the default applies exactly.
async function restoreDefault(browser: Browser, baseURL: string) {
  const owner = await ownerSession(browser, baseURL);
  expect((await setPolicy(owner.request, baseURL, owner.csrf, "optional")).status()).toBe(200);
  await owner.context.close();
  await db().query(`delete from settings where key = 'auth_policy'`);
}

test.afterAll(async ({ browser }) => {
  await restoreDefault(browser, process.env.E2E_BASE_URL || "http://localhost:3007");
  await cleanup();
});

async function ownerSession(browser: Browser, baseURL: string) {
  const email = uniqueEmail("policy-owner");
  await createUser({ email, password: PASSWORD, role: "owner", name: "E2E policy owner", totpSecret: TOTP_SECRET });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
    headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL },
    data: { code: await generate({ secret: TOTP_SECRET }) },
  });
  expect(verify.status()).toBe(200);
  return { context, csrf: login.csrf, request: context.request };
}

function setPolicy(request: APIRequestContext, baseURL: string, csrf: string, mfa: string) {
  return request.post(`${baseURL}/api/admin/security/authentication`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data: { mfa } });
}

// Signs in a fresh account of the given role and reports where the sign in
// sends it, and which page the console shows when it then asks for the
// dashboard: the dashboard itself, the second factor prompt, or enrolment.
// (The account page is not used as the probe: it is deliberately reachable
// before enrolment, since that is where enrolment is offered.) The page gate
// answers a redirect as a stub the browser follows, so the landing is read
// from the heading that finally renders, not from a status code.
async function signInAs(browser: Browser, baseURL: string, role: "admin" | "editor", withTotp: boolean) {
  const email = uniqueEmail(`policy-${role}`);
  await createUser({ email, password: PASSWORD, role, name: `E2E policy ${role}`, totpSecret: withTotp ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const page = await context.newPage();
  await page.goto(`${baseURL}/admin`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  const text = (await heading.textContent()) ?? "";
  const landing = text.includes("Two-factor check") ? "verify" : text.includes("Set up two-factor") ? "enrol" : text.includes("Welcome") ? "console" : `unexpected: ${text}`;
  const out = { redirectTo: login.body.redirectTo ?? "", landing };
  await context.close();
  return out;
}

test("optional by default: nobody is made to enrol, and whoever has enrolled is asked", async ({ browser, baseURL }) => {
  await restoreDefault(browser, baseURL!);
  const adminWithout = await signInAs(browser, baseURL!, "admin", false);
  expect(adminWithout.redirectTo).toBe("/admin");
  expect(adminWithout.landing).toBe("console");
  const adminWith = await signInAs(browser, baseURL!, "admin", true);
  expect(adminWith.redirectTo).toContain("/admin/mfa/verify");
  expect(adminWith.landing).toBe("verify");
});

test("required for Owner and Admin sends an Admin without an authenticator to enrol and an Editor through; everyone catches the Editor too", async ({ browser, baseURL }) => {
  const owner = await ownerSession(browser, baseURL!);
  expect((await setPolicy(owner.request, baseURL!, owner.csrf, "admins")).status()).toBe(200);
  const admin = await signInAs(browser, baseURL!, "admin", false);
  expect(admin.redirectTo).toBe("/admin/mfa/enrol");
  expect(admin.landing).toBe("enrol");
  const editor = await signInAs(browser, baseURL!, "editor", false);
  expect(editor.redirectTo).toBe("/admin");
  expect(editor.landing).toBe("console");
  expect((await setPolicy(owner.request, baseURL!, owner.csrf, "everyone")).status()).toBe(200);
  const editorNow = await signInAs(browser, baseURL!, "editor", false);
  expect(editorNow.redirectTo).toBe("/admin/mfa/enrol");
  expect(editorNow.landing).toBe("enrol");
  await owner.context.close();
});

test("off lets an enrolled Admin in on the password alone, the page shows it, and the change is audited", async ({ browser, baseURL }) => {
  const owner = await ownerSession(browser, baseURL!);
  expect((await setPolicy(owner.request, baseURL!, owner.csrf, "off")).status()).toBe(200);
  const admin = await signInAs(browser, baseURL!, "admin", true);
  expect(admin.redirectTo).toBe("/admin");
  expect(admin.landing).toBe("console");
  const page = await owner.context.newPage();
  await page.goto("/admin/security/authentication");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Authentication");
  await expect(page.locator("#mfa-off")).toBeChecked();
  const audited = await db().query(`select 1 from audit_log where action = 'security.mfa_policy.update'`);
  expect(audited.rowCount).toBeGreaterThanOrEqual(1);
  await owner.context.close();
});

test("an Admin may look but not change it", async ({ browser, baseURL }) => {
  const email = uniqueEmail("policy-admin-ro");
  await createUser({ email, password: PASSWORD, role: "admin", name: "E2E policy admin", totpSecret: TOTP_SECRET });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL!, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  if ((login.body.redirectTo ?? "").includes("/admin/mfa/verify")) {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
      headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL! },
      data: { code: await generate({ secret: TOTP_SECRET }) },
    });
    expect(verify.status()).toBe(200);
  }
  const page = await context.newPage();
  await page.goto("/admin/security/authentication");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Authentication");
  await expect(page.getByText("Only the Owner can change this.")).toBeVisible();
  const refused = await setPolicy(context.request, baseURL!, login.csrf, "optional");
  expect(refused.status()).toBe(403);
  await context.close();
});
