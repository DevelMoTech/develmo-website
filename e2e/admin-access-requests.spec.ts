// The request-access flow: a public form that creates a queue entry and
// nothing else, and a console decision that either mints the ordinary
// single-use invite or refuses. The point of these tests is that no path
// through the public form produces an account by itself.

import { generate } from "otplib";
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";
import { ACCESS_REQUEST_RECAPTCHA_ACTION } from "../src/lib/schemas/access";

const PASSWORD = "e2e-correct-horse-battery";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "owner" | "admin" | "editor" | "viewer" = "owner") {
  const email = uniqueEmail(`ar-${role}`);
  const mfa = role === "owner" || role === "admin";
  await createUser({ email, password: PASSWORD, role, name: `E2E ${role}`, totpSecret: mfa ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  if (mfa) {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
      headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL },
      data: { code: await generate({ secret: TOTP_SECRET }) },
    });
    expect(verify.status()).toBe(200);
  }
  return { context, page: await context.newPage(), csrf: login.csrf, email, request: context.request };
}

// The public endpoint takes no CSRF token; it is a public form like
// /api/contact. It does take a reCAPTCHA token whenever keys are configured,
// and they are configured locally, so a submission that has to succeed mints a
// real one in a browser page the way the form does.
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

async function mintToken(browser: Browser, baseURL: string): Promise<string> {
  if (!SITE_KEY) return "";
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/admin/request-access`);
  await page.waitForFunction(() => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined");
  const token = await page.evaluate(
    ([key, action]) =>
      new Promise<string>((resolve) =>
        (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.ready(() =>
          (window as unknown as { grecaptcha: { execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.execute(key, { action }).then(resolve),
        ),
      ),
    [SITE_KEY, ACCESS_REQUEST_RECAPTCHA_ACTION],
  );
  await context.close();
  return token;
}

function request(api: APIRequestContext, baseURL: string, data: Record<string, unknown>, ip = uniqueIp()) {
  return api.post(`${baseURL}/api/access-request`, {
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    data,
  });
}

async function rowFor(email: string) {
  const r = await db().query<{ id: string; status: string; name: string; invite_id: string | null }>(
    `select id, status, name, invite_id from access_requests where email = $1`,
    [email],
  );
  return r.rows[0] ?? null;
}

test.afterAll(async () => {
  await db().query(`delete from access_requests where email like $1`, [`%${RUN}%`]);
  await db().query(`delete from invites where email like $1`, [`%${RUN}%`]);
  await cleanup();
});

test("the public form is reachable signed out and creates a request, not an account", async ({ browser, baseURL }) => {
  const anon = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const page = await anon.newPage();
  const res = await page.goto(`${baseURL}/admin/request-access`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Request access" })).toBeVisible();
  // Reached from the sign-in page, which is where someone without an account lands.
  await page.goto(`${baseURL}/admin/login`);
  await expect(page.getByRole("link", { name: /Request access/i })).toBeVisible();

  const email = `requester-${RUN}@example.com`;
  const answer = await request(anon.request, baseURL!, {
    name: "Ada Lovelace",
    email,
    organisation: "Analytical Engines",
    reason: "I need to publish the launch post and update the services page.",
    recaptchaToken: await mintToken(browser, baseURL!),
  });
  expect(answer.status()).toBe(200);
  expect((await answer.json()).ok).toBe(true);

  const row = await rowFor(email);
  expect(row, "the request was stored").not.toBeNull();
  expect(row!.status).toBe("pending");

  // The decisive assertion: no account and no invite exist yet.
  const users = await db().query(`select id from users where email = $1`, [email]);
  const invites = await db().query(`select id from invites where email = $1`, [email]);
  expect(users.rowCount, "no account was created").toBe(0);
  expect(invites.rowCount, "no invitation was created").toBe(0);
  console.log(`ACCESS REQUEST: stored as pending, with no account and no invitation for ${email}`);
  await anon.close();
});

test("a second request from the same address updates the queue entry instead of duplicating it", async ({ browser, baseURL }) => {
  const anon = await browser.newContext();
  const email = `requester-${RUN}@example.com`;
  const again = await request(anon.request, baseURL!, {
    name: "Ada L Lovelace",
    email,
    reason: "Resending with my full name, I need access to the blog editor.",
    recaptchaToken: await mintToken(browser, baseURL!),
  });
  expect(again.status()).toBe(200);
  const rows = await db().query(`select id, name from access_requests where email = $1`, [email]);
  expect(rows.rowCount, "still one row").toBe(1);
  expect(rows.rows[0].name).toBe("Ada L Lovelace");
  await anon.close();
});

test("approving mints the ordinary single use invitation and the invite page accepts it", async ({ browser, baseURL }) => {
  const owner = await signedIn(browser, baseURL!, "owner");
  const email = `requester-${RUN}@example.com`;
  const row = await rowFor(email);
  expect(row).not.toBeNull();

  const res = await owner.request.post(`${baseURL}/api/admin/users/access-request`, {
    headers: { "x-csrf-token": owner.csrf, "content-type": "application/json", origin: baseURL! },
    data: { id: row!.id, decision: "approve", role: "editor" },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; decision: string; url: string };
  expect(body.decision).toBe("approve");

  const after = await rowFor(email);
  expect(after!.status).toBe("approved");
  expect(after!.invite_id, "the decision recorded which invitation it created").not.toBeNull();

  const invites = await db().query<{ role: string }>(`select role from invites where email = $1 and used_at is null and revoked_at is null`, [email]);
  expect(invites.rowCount).toBe(1);
  expect(invites.rows[0].role).toBe("editor");

  // The invitation link is the existing signup page, unchanged.
  const page = await owner.context.newPage();
  const invitePage = await page.goto(body.url);
  expect(invitePage?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  console.log(`ACCESS REQUEST: approval created one editor invitation and ${body.url.split("?")[0]} accepted the token`);

  // A decided request cannot be decided twice.
  const again = await owner.request.post(`${baseURL}/api/admin/users/access-request`, {
    headers: { "x-csrf-token": owner.csrf, "content-type": "application/json", origin: baseURL! },
    data: { id: row!.id, decision: "decline" },
  });
  expect(again.status()).toBe(409);
  await owner.context.close();
});

test("declining records the decision and sends nothing", async ({ browser, baseURL }) => {
  const owner = await signedIn(browser, baseURL!, "owner");
  const email = `declined-${RUN}@example.com`;
  const anon = await browser.newContext();
  expect((await request(anon.request, baseURL!, { name: "Mallory", email, reason: "Let me in, I would like a look around.", recaptchaToken: await mintToken(browser, baseURL!) })).status()).toBe(200);
  const row = await rowFor(email);

  const res = await owner.request.post(`${baseURL}/api/admin/users/access-request`, {
    headers: { "x-csrf-token": owner.csrf, "content-type": "application/json", origin: baseURL! },
    data: { id: row!.id, decision: "decline", note: "Not a colleague." },
  });
  expect(res.status()).toBe(200);
  const after = await rowFor(email);
  expect(after!.status).toBe("declined");
  const invites = await db().query(`select id from invites where email = $1`, [email]);
  expect(invites.rowCount, "declining creates no invitation").toBe(0);
  const users = await db().query(`select id from users where email = $1`, [email]);
  expect(users.rowCount, "declining creates no account").toBe(0);
  console.log("ACCESS REQUEST: a declined request left no invitation and no account behind");
  await anon.close();
  await owner.context.close();
});

test("an address that already has an account is stored as nothing, with the same answer", async ({ browser, baseURL }) => {
  const existing = uniqueEmail(`ar-existing-${RUN}`);
  await createUser({ email: existing, password: PASSWORD, role: "viewer", name: "Already Here" });
  const anon = await browser.newContext();
  const res = await request(anon.request, baseURL!, { name: "Someone", email: existing, reason: "Probing whether this address exists.", recaptchaToken: await mintToken(browser, baseURL!) });
  expect(res.status(), "the answer is the same as for an unknown address").toBe(200);
  expect((await res.json()).ok).toBe(true);
  const rows = await db().query(`select id from access_requests where email = $1`, [existing]);
  expect(rows.rowCount, "nothing was queued, so the form cannot confirm an address").toBe(0);
  console.log("ACCESS REQUEST: a known address gets the same answer and leaves no row, so the form cannot be used to test addresses");
  await anon.close();
});

test("the honeypot and the rate limit hold, and Editor and Viewer cannot decide", async ({ browser, baseURL }) => {
  const anon = await browser.newContext();
  const trapped = `bot-${RUN}@example.com`;
  const res = await request(anon.request, baseURL!, {
    name: "Bot",
    email: trapped,
    reason: "Automated submission that should be caught.",
    company_url: "https://spam.example",
  });
  expect(res.status(), "a bot gets the same answer a person gets").toBe(200);
  expect((await db().query(`select id from access_requests where email = $1`, [trapped])).rowCount, "the honeypot row was not queued").toBe(0);

  // The limiter runs before the captcha check, so this proves the limit
  // without minting five tokens: the first few are refused for the captcha,
  // the later ones for the rate limit.
  const ip = uniqueIp();
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await request(anon.request, baseURL!, { name: `Flooder ${i}`, email: `flood-${i}-${RUN}@example.com`, reason: "Repeated submissions from one address." }, ip);
    codes.push(r.status());
  }
  expect(codes.filter((c) => c === 429).length, `rate limited eventually, got ${codes.join(",")}`).toBeGreaterThan(0);
  console.log(`ACCESS REQUEST: five submissions from one address answered ${codes.join(", ")}`);

  for (const role of ["editor", "viewer"] as const) {
    const who = await signedIn(browser, baseURL!, role);
    const denied = await who.request.post(`${baseURL}/api/admin/users/access-request`, {
      headers: { "x-csrf-token": who.csrf, "content-type": "application/json", origin: baseURL! },
      data: { id: "3f7d1c2e-9a4b-4c1d-8e2f-1a2b3c4d5e6f", decision: "approve", role: "viewer" },
    });
    expect(denied.status(), `${role} must not decide access requests`).toBe(403);
    await who.context.close();
  }
  await anon.close();
});
