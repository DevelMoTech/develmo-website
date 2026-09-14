import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const STARTED = new Date();

// A documentation range (RFC 5737) that never belongs to a real visitor, so
// blocking it cannot affect anything but this test.
const BLOCK_IP = "203.0.113.77";
const BLOCK_RANGE = "198.51.100.0/24";

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "owner" | "admin" | "editor" | "viewer" = "admin") {
  const email = uniqueEmail(`sec-${role}`);
  const mfa = role === "owner" || role === "admin";
  await createUser({ email, password: PASSWORD, role, name: `E2E security ${role}`, totpSecret: mfa ? TOTP_SECRET : undefined });
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

// An anonymous request that presents a chosen address, the way Vercel's
// proxy presents a visitor's.
async function asVisitor(browser: Browser, url: string, ip: string) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const res = await ctx.request.get(url, { maxRedirects: 0 });
  const out = { status: res.status(), body: await res.text() };
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

test.afterAll(async () => {
  const pool = db();
  await pool.query("delete from ip_rules where created_at >= $1", [STARTED]);
  await pool.query("delete from rate_limit_config where key = 'contact'");
  await pool.query("delete from rate_limit_hits where key like $1", [`contact:%`]);
  await pool.query("delete from security_events where created_at >= $1 and (email like $2 or email like $3)", [STARTED, `%${RUN}%`, "%e2e-sec-%"]);
  await cleanup();
});

test("a blocked address gets 403 on the public homepage, and removing the rule lets it back in", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const before = await asVisitor(browser, `${baseURL}/`, BLOCK_IP);
  expect(before.status).toBe(200);

  const admin = await signedIn(browser, baseURL!, "admin");
  const created = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/access/save", { cidr: BLOCK_IP, action: "block", reason: `e2e ${RUN}`, expiresAt: "", confirm: "" });
  expect(created.status()).toBe(200);
  const { id } = (await created.json()) as { id: string };

  const blocked = await until(() => asVisitor(browser, `${baseURL}/`, BLOCK_IP), (r) => r.status === 403, 20_000);
  console.log(`BLOCK EVIDENCE: ${BLOCK_IP} got ${blocked.value.status} on / after ${blocked.ms}ms; body="${blocked.value.body.split("\n")[0]}"`);
  expect(blocked.value.status).toBe(403);
  // The whole site, not just pages: the contact API is refused too.
  const api = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": BLOCK_IP } });
  const apiRes = await api.request.post(`${baseURL}/api/contact`, { data: { firstName: "a" }, failOnStatusCode: false });
  expect(apiRes.status()).toBe(403);
  await api.close();
  // Everyone else is unaffected.
  expect((await asVisitor(browser, `${baseURL}/`, "198.51.100.200")).status).toBe(200);

  // A CIDR range blocks every address inside it.
  const range = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/access/save", { cidr: BLOCK_RANGE, action: "block", reason: `e2e range ${RUN}`, expiresAt: "", confirm: "" });
  expect(range.status()).toBe(200);
  const rangeBlocked = await until(() => asVisitor(browser, `${baseURL}/`, "198.51.100.200"), (r) => r.status === 403, 20_000);
  expect(rangeBlocked.value.status).toBe(403);
  // An allow rule is the way out of an over-broad block.
  const allow = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/access/save", { cidr: "198.51.100.200", action: "allow", reason: `e2e allow ${RUN}`, expiresAt: "", confirm: "" });
  expect(allow.status()).toBe(200);
  const allowed = await until(() => asVisitor(browser, `${baseURL}/`, "198.51.100.200"), (r) => r.status === 200, 20_000);
  expect(allowed.value.status).toBe(200);

  // The console lists the rules and removing one restores access.
  await admin.page.goto("/admin/security/access");
  await expect(admin.page.getByRole("row", { name: new RegExp(BLOCK_IP.replace(/\./g, "\\.")) })).toBeVisible();
  const removed = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/access/delete", { id });
  expect(removed.status()).toBe(200);
  const back = await until(() => asVisitor(browser, `${baseURL}/`, BLOCK_IP), (r) => r.status === 200, 20_000);
  console.log(`UNBLOCK EVIDENCE: ${BLOCK_IP} back to ${back.value.status} after ${back.ms}ms`);
  expect(back.value.status).toBe(200);
  await admin.context.close();
});

test("the lockout guard refuses to block the address you are connecting from unless it is typed back", async ({ browser, baseURL }) => {
  const myIp = uniqueIp();
  const email = uniqueEmail("sec-lockout");
  await createUser({ email, password: PASSWORD, role: "admin", name: "E2E lockout admin", totpSecret: TOTP_SECRET });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": myIp } });
  const login = await apiLogin(context.request, baseURL!, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, { headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL! }, data: { code: await generate({ secret: TOTP_SECRET }) } });
  expect(verify.status()).toBe(200);

  // Blocking your own address, with no confirmation: refused.
  const refused = await post(context.request, baseURL!, login.csrf, "/api/admin/security/access/save", { cidr: myIp, action: "block", reason: "oops", expiresAt: "", confirm: "" });
  const refusedBody = (await refused.json()) as { error: string; detail?: string; yourIp?: string };
  console.log(`LOCKOUT GUARD: blocking own address ${myIp} answered ${refused.status()} ${refusedBody.error}; detail="${refusedBody.detail}"`);
  expect(refused.status()).toBe(400);
  expect(refusedBody.error).toBe("self_lockout");
  expect(refusedBody.detail).toContain(myIp);

  // A wide range that happens to cover it: refused for the same reason.
  const wide = await post(context.request, baseURL!, login.csrf, "/api/admin/security/access/save", { cidr: `${myIp.split(".").slice(0, 3).join(".")}.0/24`, action: "block", reason: "oops", expiresAt: "", confirm: "" });
  expect(wide.status()).toBe(400);
  expect(((await wide.json()) as { error: string }).error).toBe("self_lockout");

  // The wrong confirmation is still a refusal.
  const wrong = await post(context.request, baseURL!, login.csrf, "/api/admin/security/access/save", { cidr: myIp, action: "block", reason: "oops", expiresAt: "", confirm: "192.0.2.1" });
  expect(wrong.status()).toBe(400);

  // Nothing was written by any of the three attempts.
  const rows = await db().query("select id from ip_rules where cidr = $1", [myIp]);
  expect(rows.rowCount).toBe(0);

  // Typed back exactly, it goes through. (Then removed, so the suite's other
  // tests are not blocked by it.)
  const accepted = await post(context.request, baseURL!, login.csrf, "/api/admin/security/access/save", { cidr: myIp, action: "block", reason: "deliberate", expiresAt: "", confirm: myIp });
  expect(accepted.status()).toBe(200);
  const { id } = (await accepted.json()) as { id: string };
  await db().query("delete from ip_rules where id = $1", [id]);
  await context.close();
});

test("three failed logins produce three events, visible and filterable in the console", async ({ browser, baseURL }) => {
  const victim = uniqueEmail(`sec-target-${RUN}`);
  await createUser({ email: victim, password: PASSWORD, role: "editor", name: "E2E security target" });
  const attacker = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });

  const before = await db().query<{ n: string }>("select count(*)::text as n from security_events where type = 'login_failed' and email = $1", [victim]);
  expect(Number(before.rows[0].n)).toBe(0);

  for (let i = 0; i < 3; i++) {
    const res = await apiLogin(attacker.request, baseURL!, { email: victim, password: `wrong-password-${i}` });
    expect(res.status).toBe(401);
  }
  await attacker.close();

  const counted = await until(
    async () => Number((await db().query<{ n: string }>("select count(*)::text as n from security_events where type = 'login_failed' and email = $1", [victim])).rows[0].n),
    (n) => n >= 3,
    15_000,
  );
  console.log(`EVENT EVIDENCE: three failed logins for ${victim} produced ${counted.value} login_failed events after ${counted.ms}ms`);
  expect(counted.value).toBe(3);

  const admin = await signedIn(browser, baseURL!, "admin");
  await admin.page.goto(`/admin/security/events?type=login_failed&email=${encodeURIComponent(victim)}`);
  await expect(admin.page.getByText("Showing 1 to 3 of 3")).toBeVisible();
  await expect(admin.page.getByRole("row", { name: new RegExp(victim) })).toHaveCount(3);

  // The CSV export carries the same rows and no plain address.
  const csv = await admin.request.get(`${baseURL}/api/admin/security/events/export?type=login_failed&email=${encodeURIComponent(victim)}`);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  const lines = body.trim().split("\r\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain("ip_hash");
  expect(body).not.toContain("x-forwarded-for");
  await admin.context.close();
});

test("a rate limit change takes effect without a restart", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await signedIn(browser, baseURL!, "admin");

  // Down to one request per minute, then a fresh address is refused on its
  // second contact submission.
  const tighten = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/rate-limits/save", { key: "contact", maxRequests: 1, windowSeconds: 60 });
  expect(tighten.status()).toBe(200);

  const submit = async (ip: string) => {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
    const res = await ctx.request.post(`${baseURL}/api/contact`, {
      headers: { "content-type": "application/json" },
      data: { firstName: "Rate", lastName: "Limit", email: `e2e-rate-${RUN}@e2e-ratelimit.invalid`, phone: "", company: "", budget: "", service: "", message: "Checking the runtime rate limit takes effect.", consent: true, company_url: "", recaptchaToken: "" },
      failOnStatusCode: false,
    });
    const out = res.status();
    await ctx.close();
    return out;
  };

  // The limiter reads its configuration through a 30 second cache, so give
  // it up to that long to pick the new value up. No restart, no deploy.
  const tightened = await until(
    async () => {
      const ip = uniqueIp();
      const first = await submit(ip);
      const second = await submit(ip);
      return { first, second };
    },
    // The limiter runs before validation, so what proves the change is the
    // transition: the first request is let through to the route, the second
    // from the same address is refused with 429. (This environment has
    // reCAPTCHA keys, so the accepted request answers 400 on the captcha
    // rather than 200; that is the route, not the limiter.)
    (r) => r.first !== 429 && r.second === 429,
    45_000,
    2_000,
  );
  console.log(`RATE LIMIT EVIDENCE: with the limit set to 1 per minute, the first request answered ${tightened.value.first} (reached the route) and the second ${tightened.value.second} (refused by the limiter), after ${tightened.ms}ms and no restart`);
  expect(tightened.value.first).not.toBe(429);
  expect(tightened.value.second).toBe(429);

  // The console shows it as changed from the default, and resetting restores it.
  await admin.page.goto("/admin/security/limits");
  const row = admin.page.getByRole("row", { name: /Contact form/ });
  await expect(row.getByText("set here")).toBeVisible();
  await expect(row.getByLabel("Requests")).toHaveValue("1");
  const reset = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/rate-limits/reset", { key: "contact" });
  expect(reset.status()).toBe(200);

  const restored = await until(
    async () => {
      const ip = uniqueIp();
      const first = await submit(ip);
      const second = await submit(ip);
      return { first, second };
    },
    (r) => r.first !== 429 && r.second !== 429,
    45_000,
    2_000,
  );
  console.log(`RATE LIMIT EVIDENCE: back at the default of 5 per minute, two requests from one address answered ${restored.value.first} and ${restored.value.second}, neither refused by the limiter`);
  expect(restored.value.second).not.toBe(429);
  await admin.context.close();
});

test("Editor and Viewer are refused by every endpoint in this module, with valid sessions", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const endpoints: { path: string; body: Record<string, unknown>; method?: "GET" }[] = [
    { path: "/api/admin/security/access/save", body: { cidr: "203.0.113.200", action: "block", reason: "", expiresAt: "", confirm: "" } },
    { path: "/api/admin/security/access/delete", body: { id: "00000000-0000-4000-8000-000000000000" } },
    { path: "/api/admin/security/rate-limits/save", body: { key: "contact", maxRequests: 99, windowSeconds: 60 } },
    { path: "/api/admin/security/rate-limits/reset", body: { key: "contact" } },
    { path: "/api/admin/security/turnstile", body: { enabled: false, siteKey: "" } },
    { path: "/api/admin/security/sessions/revoke", body: { sessionId: "00000000-0000-4000-8000-000000000000" } },
    { path: "/api/admin/security/users/action", body: { userId: "00000000-0000-4000-8000-000000000000", action: "lock" } },
    { path: "/api/admin/security/retention", body: { eventDays: 30 } },
    { path: "/api/admin/security/headers", body: { path: "/" } },
    { path: "/api/admin/security/dependencies/scan", body: {} },
    { path: "/api/admin/security/events/export", body: {}, method: "GET" },
  ];

  for (const role of ["editor", "viewer"] as const) {
    const who = await signedIn(browser, baseURL!, role);
    for (const e of endpoints) {
      const res = e.method === "GET"
        ? await who.request.get(`${baseURL}${e.path}`, { failOnStatusCode: false })
        : await post(who.request, baseURL!, who.csrf, e.path, e.body);
      expect(res.status(), `${role} calling ${e.path}`).toBe(403);
      expect(((await res.json()) as { error: string }).error, `${role} calling ${e.path}`).toBe("forbidden");
    }
    // The pages send them away too.
    for (const page of ["/admin/security", "/admin/security/authentication", "/admin/security/events", "/admin/security/access", "/admin/security/limits", "/admin/security/sessions", "/admin/security/headers", "/admin/security/dependencies"]) {
      await who.page.goto(page);
      await expect(who.page).toHaveURL(/\/admin\?denied=/);
    }
    console.log(`RBAC EVIDENCE: ${role} was refused by all ${endpoints.length} endpoints and all 7 pages`);
    await who.context.close();
  }
});

test("session and account oversight: revoke, force reset, lock and unlock, with the guards", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const admin = await signedIn(browser, baseURL!, "admin");
  const target = await signedIn(browser, baseURL!, "editor");

  await admin.page.goto("/admin/security/sessions");
  const row = admin.page.getByRole("row", { name: new RegExp(target.email) }).first();
  await expect(row).toBeVisible();

  // Revoke that one session; the holder is signed out on the next request.
  const sessions = await db().query<{ id: string }>("select s.id from sessions s join users u on u.id = s.user_id where u.email = $1 and s.revoked_at is null", [target.email]);
  expect(sessions.rowCount).toBe(1);
  const revoked = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/sessions/revoke", { sessionId: sessions.rows[0].id });
  expect(revoked.status()).toBe(200);
  const after = await target.request.get(`${baseURL}/api/admin/search?q=test`, { failOnStatusCode: false });
  expect(after.status()).toBe(401);

  // Lock the account, then confirm it cannot sign in.
  const locked = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/users/action", { userId: (await db().query<{ id: string }>("select id from users where email = $1", [target.email])).rows[0].id, action: "lock" });
  expect(locked.status()).toBe(200);
  const blockedLogin = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const attempt = await apiLogin(blockedLogin.request, baseURL!, { email: target.email, password: PASSWORD });
  expect(attempt.status).not.toBe(200);
  await blockedLogin.close();

  // Unlock, and it works again.
  const targetId = (await db().query<{ id: string }>("select id from users where email = $1", [target.email])).rows[0].id;
  const unlocked = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/users/action", { userId: targetId, action: "unlock" });
  expect(unlocked.status()).toBe(200);
  const retry = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  expect((await apiLogin(retry.request, baseURL!, { email: target.email, password: PASSWORD })).status).toBe(200);
  await retry.close();

  // Guards: an admin cannot lock themselves, and cannot act on an owner.
  const adminId = (await db().query<{ id: string }>("select id from users where email = $1", [admin.email])).rows[0].id;
  const selfLock = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/users/action", { userId: adminId, action: "lock" });
  expect(selfLock.status()).toBe(400);
  expect(((await selfLock.json()) as { detail: string }).detail).toMatch(/cannot lock your own account/i);

  const owner = await signedIn(browser, baseURL!, "owner");
  const ownerId = (await db().query<{ id: string }>("select id from users where email = $1", [owner.email])).rows[0].id;
  const ownerLock = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/users/action", { userId: ownerId, action: "lock" });
  expect(ownerLock.status()).toBe(400);
  expect(((await ownerLock.json()) as { detail: string }).detail).toMatch(/Only an Owner/i);
  console.log("OVERSIGHT EVIDENCE: session revoked, account locked and unlocked, self-lock and owner-lock both refused");

  await owner.context.close();
  await target.context.close();
  await admin.context.close();
});

test("the headers panel reads the live policy back and grades it, and every security page fits its viewport", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, baseURL!, "admin");

  await admin.page.goto("/admin/security/headers");
  await expect(admin.page.getByText(/^Grade /)).toBeVisible({ timeout: 20_000 });
  const graded = admin.page.getByRole("row", { name: /content-security-policy/ });
  await expect(graded).toBeVisible();
  await expect(admin.page.getByRole("row", { name: /strict-transport-security/ }).getByText("pass")).toBeVisible();
  const report = await post(admin.request, baseURL!, admin.csrf, "/api/admin/security/headers", { path: "/" });
  const { report: r } = (await report.json()) as { report: { grade: string; checks: { header: string; status: string }[] } };
  console.log(`HEADERS EVIDENCE: grade ${r.grade}; ${r.checks.map((c) => `${c.header}=${c.status}`).join(", ")}`);

  const pages = ["/admin/security", "/admin/security/authentication", "/admin/security/events", "/admin/security/access", "/admin/security/limits", "/admin/security/sessions", "/admin/security/headers", "/admin/security/dependencies"];
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
