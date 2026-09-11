import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "editor" | "viewer" | "admin" = "admin") {
  const email = uniqueEmail(`inbox-${role}`);
  await createUser({ email, password: PASSWORD, role, name: `E2E inbox ${role}`, totpSecret: role === "admin" ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  if (role === "admin") {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, { headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL }, data: { code: await generate({ secret: TOTP_SECRET }) } });
    expect(verify.status()).toBe(200);
  }
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf, request: context.request };
}

function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: Record<string, unknown>) {
  return request.post(`${baseURL}${path}`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data });
}

// With reCAPTCHA keys configured locally the API verifies tokens for real,
// so API-level submissions mint a genuine single-use token in a browser page.
async function mintToken(browser: Browser, baseURL: string): Promise<string> {
  if (!SITE_KEY) return "";
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/contact-develmo`);
  await page.waitForFunction(() => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined", null, { timeout: 30_000 });
  const token = await page.evaluate(
    ([key]) =>
      new Promise<string>((resolve) =>
        (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.ready(() =>
          (window as unknown as { grecaptcha: { execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.execute(key, { action: "contact" }).then(resolve),
        ),
      ),
    [SITE_KEY],
  );
  await context.close();
  return token;
}

function contactPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Durable",
    lastName: "Enquiry",
    email: `e2e-durable-${RUN}@e2e-durability.invalid`,
    phone: "",
    company: "E2E Ltd",
    budget: "",
    service: "",
    message: "This enquiry must survive a total delivery failure.",
    consent: true,
    company_url: "",
    recaptchaToken: "",
    ...overrides,
  };
}

// With a mailbox in .env.local (SMTP_HOST, SMTP_USER and SMTP_PASS all set)
// the delivery chain succeeds through SMTP and a real message lands in the
// owner's inbox, so the durability checks below prove delivery and its record
// instead of failure and its record. The visitor sees success either way.
const smtpLive = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

type Row = { id: string; status: string; is_spam: boolean; spam_reason: string | null; tags: string[]; service: string; intent: string; industry: string; product: string; landing_page: string; referrer: string; utm: Record<string, string> | null; locale: string; delivery_status: string; delivery_error: string | null; delivery_channel: string | null; delivery_attempts: number; message: string; ip_hash: string | null; user_agent: string | null };
async function rowFor(email: string): Promise<Row | undefined> {
  return (await db().query<Row>(`select id, status, is_spam, spam_reason, tags, service, intent, industry, product, landing_page, referrer, utm, locale, delivery_status, delivery_error, delivery_channel, delivery_attempts, message, ip_hash, user_agent from submissions where email = $1 order by created_at desc limit 1`, [email])).rows[0];
}

test.afterAll(async () => {
  // Scoped to this worker's run: a retried serial group starts a new worker,
  // and the old worker's teardown must not delete the new worker's rows.
  await db().query(`delete from submissions where email like $1`, [`e2e-%${RUN}@%`]);
  await db().query(`delete from settings where key = 'retention'`);
  await cleanup();
});

test("the public contact form stores the enquiry with the ?service, ?intent and ?industry qualifiers, attribution and locale", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const email = `e2e-form-${RUN}@example.com`;
  // No extra headers on this context: Playwright would add them to the
  // cross-origin reCAPTCHA script request and trip CORS.
  const context = await browser.newContext();
  const page = await context.newPage();
  // Land on the home page with a utm tag first, so first-touch attribution is exercised.
  await page.goto(`${baseURL}/?utm_source=e2e&utm_campaign=inbox`);
  // First touch is recorded by a client effect, so let it run before
  // navigating on; otherwise the contact page becomes the landing page.
  await page.waitForFunction(() => !!window.sessionStorage.getItem("dm_visit"), null, { timeout: 15_000 });
  await page.goto(`${baseURL}/contact-develmo?service=CrowdIQ&intent=demo&industry=retail`);
  await page.fill("#firstName", "Grace");
  await page.fill("#lastName", "Hopper");
  await page.fill("#email", email);
  await page.fill("#message", "This is an automated end-to-end inbox test enquiry.");
  await page.check("input[name='consent']");
  if (SITE_KEY) await page.waitForFunction(() => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined", null, { timeout: 30_000 });
  await page.getByRole("button", { name: /book my consultation/i }).click();
  await expect(page.locator(".form-success")).toBeVisible({ timeout: 45_000 });
  await context.close();

  const row = await rowFor(email);
  expect(row).toBeTruthy();
  // A QA address (@example.*) is stored for the record but arrives already
  // read and tagged, so the production e2e never leaves unread noise.
  expect(row!.status).toBe("read");
  expect(row!.tags).toEqual(["qa"]);
  expect(row!.is_spam).toBe(false);
  expect(row!.service).toBe("CrowdIQ");
  expect(row!.intent).toBe("demo");
  expect(row!.industry).toBe("retail");
  expect(row!.landing_page).toBe("/?utm_source=e2e&utm_campaign=inbox");
  expect(row!.utm).toEqual({ source: "e2e", campaign: "inbox" });
  expect(row!.locale).toBe("en");
  expect(row!.ip_hash).toMatch(/^[a-f0-9]{40}$/);
  expect(row!.user_agent).toContain("HeadlessChrome");
  // The stored message is the visitor's text; the qualifiers are columns.
  expect(row!.message).toBe("This is an automated end-to-end inbox test enquiry.");
  // QA addresses are stored but never delivered, as before.
  await expect.poll(async () => (await rowFor(email))!.delivery_status).toBe("skipped");
  expect((await rowFor(email))!.delivery_error).toContain("QA address");
});

test("DURABILITY: with Resend unset, the webhook and FormSubmit unreachable, the enquiry is stored, the visitor sees success, and the outcome is recorded", async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  // Preconditions: the test server must be running with these in its environment.
  expect(process.env.RESEND_API_KEY ?? "", "RESEND_API_KEY must be unset").toBe("");
  expect(process.env.CONTACT_WEBHOOK_URL ?? "", "CONTACT_WEBHOOK_URL must point at an unreachable local port").toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
  expect(process.env.FORMSUBMIT_URL ?? "", "FORMSUBMIT_URL must point at an unreachable local port").toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);

  const payload = contactPayload({ recaptchaToken: await mintToken(browser, baseURL!) });
  const res = await request.post(`${baseURL}/api/contact`, { headers: { "x-forwarded-for": uniqueIp() }, data: payload });
  const body = await res.json();
  // The visitor's answer: success, exactly what the form shows as "Thanks".
  expect(res.status()).toBe(200);
  expect(body).toEqual({ ok: true });

  // The enquiry is on disk first...
  const stored = await rowFor(payload.email);
  expect(stored).toBeTruthy();
  expect(stored!.status).toBe("new");
  // ...and the chain, running after the response, records its outcome on the
  // row: a failure with every channel named, or delivery through the mailbox.
  await expect.poll(async () => (await rowFor(payload.email))!.delivery_status, { timeout: 30_000 }).toBe(smtpLive ? "sent" : "failed");
  const row = (await rowFor(payload.email))!;
  expect(row.delivery_attempts).toBe(1);
  if (smtpLive) {
    expect(row.delivery_channel).toBe("smtp");
    expect(row.delivery_error).toBeNull();
  } else {
    expect(row.delivery_channel).toBeNull();
    expect(row.delivery_error).toMatch(/^webhook: .+; formsubmit: .+$/);
    expect(row.delivery_error).not.toContain("resend");
  }
  console.log(`DURABILITY EVIDENCE: response=${JSON.stringify(body)} status=${row.status} delivery_status=${row.delivery_status} attempts=${row.delivery_attempts} error="${row.delivery_error}"`);

  // Replay from the console ends the same way and bumps the attempt count.
  const { context, csrf, request: admin } = await signedIn(browser, baseURL!);
  const replay = await post(admin, baseURL!, csrf, "/api/admin/submissions/replay", { id: row.id });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).delivery.status).toBe(smtpLive ? "sent" : "failed");
  expect((await rowFor(payload.email))!.delivery_attempts).toBe(2);
  const audited = await db().query<{ action: string }>(`select action from audit_log where entity_type = 'submission' and entity_id = $1 and action = 'submission.replay'`, [row.id]);
  expect(audited.rowCount).toBe(1);
  await context.close();
});

test("a honeypot submission lands in the spam view instead of vanishing, and Not spam restores it", async ({ browser, baseURL, request }) => {
  const email = `e2e-honeypot-${RUN}@e2e-durability.invalid`;
  const res = await request.post(`${baseURL}/api/contact`, { headers: { "x-forwarded-for": uniqueIp() }, data: contactPayload({ email, company_url: "http://spam.example" }) });
  // Same silent "ok" as before: the bot learns nothing.
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const row = (await rowFor(email))!;
  expect(row.is_spam).toBe(true);
  expect(row.spam_reason).toBe("honeypot");
  expect(row.status).toBe("spam");
  expect(row.delivery_status).toBe("skipped");

  const { context, page } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/submissions/spam");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spam");
  const rowEl = page.locator("tr", { hasText: email });
  await expect(rowEl).toContainText("honeypot");
  await rowEl.getByRole("button", { name: "Not spam" }).click();
  await expect(page.getByText("Restored to the inbox")).toBeVisible();
  await expect.poll(async () => (await rowFor(email))!.is_spam).toBe(false);
  const restored = (await rowFor(email))!;
  expect(restored.status).toBe("new");
  // A restored enquiry is delivered now: through the mailbox when one is
  // configured, otherwise every channel is unreachable and it fails honestly.
  expect(restored.delivery_status).toBe(smtpLive ? "sent" : "failed");
  await page.goto("/admin/submissions");
  await expect(page.locator("tr", { hasText: email })).toBeVisible();
  await context.close();
});

test("triage: read on open, status, assignment, tags, threaded notes, mailto reply, filters in the URL, CSV export, sidebar badge", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, page, request, csrf, email: staffEmail } = await signedIn(browser, baseURL!);
  const staffId = (await db().query<{ id: string }>(`select id from users where email = $1`, [staffEmail])).rows[0].id;
  const email = `e2e-durable-${RUN}@e2e-durability.invalid`;
  const row = (await rowFor(email))!;
  await page.setViewportSize({ width: 1280, height: 900 });

  // The sidebar badge counts unread, non-spam submissions.
  await page.goto("/admin");
  // The badge rule: new, not spam, and not a QA (@example.*) address.
  const unread = Number((await db().query<{ n: string }>(`select count(*)::text as n from submissions where status = 'new' and is_spam = false and email !~* '@example\\.(com|org|net)$'`)).rows[0].n);
  await expect(page.locator("#adm-sidebar .adm-side-badge")).toHaveText(String(unread));

  // Opening marks it read; the reply link is prefilled from the template.
  await page.goto(`/admin/submissions/${row.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Durable Enquiry");
  await expect.poll(async () => (await rowFor(email))!.status).toBe("read");
  const mailto = await page.getByRole("link", { name: "Reply by email" }).getAttribute("href");
  expect(mailto).toContain(`mailto:${encodeURIComponent(email)}`);
  expect(decodeURIComponent(mailto!)).toContain("Hi Durable,");
  await expect(page.locator(".adm-badge", { hasText: smtpLive ? "sent" : "failed" }).first()).toBeVisible();
  if (!smtpLive) await expect(page.getByText(/^webhook: /)).toBeVisible();

  // Status, assignment, tags.
  await page.getByLabel("Status", { exact: true }).selectOption("qualified");
  await expect(page.getByText("Status: Qualified")).toBeVisible();
  await page.getByLabel("Assigned to").selectOption(staffId);
  await expect(page.getByText("Assigned", { exact: true })).toBeVisible();
  await page.getByLabel("Tags", { exact: true }).fill("Hot, follow-up");
  await page.getByLabel("Tags", { exact: true }).blur();
  await expect(page.getByText("Tags saved")).toBeVisible();
  await expect.poll(async () => (await db().query<{ tags: string[]; status: string; assignee_id: string }>(`select tags, status, assignee_id from submissions where id = $1`, [row.id])).rows[0]).toEqual({ tags: ["hot", "follow-up"], status: "qualified", assignee_id: staffId });

  // Threaded notes.
  await page.getByLabel("New note").fill("Called them, very keen.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Note added")).toBeVisible();
  await expect(page.getByText("Called them, very keen.")).toBeVisible();
  await page.getByRole("button", { name: /^Reply to the note from/ }).click();
  await page.getByLabel("Reply", { exact: true }).fill("Booked for Tuesday.");
  await page.getByRole("button", { name: "Add reply" }).click();
  await expect(page.getByText("Reply added")).toBeVisible();
  // The thread re-renders through router.refresh(); allow for a slow refresh.
  await expect(page.locator(".adm-thread-replies").getByText("Booked for Tuesday.")).toBeVisible({ timeout: 15_000 });

  // Filters are URL state and the list reflects them.
  await page.goto(`/admin/submissions?status=qualified&tag=hot&assignee=me&from=2026-01-01`);
  await expect(page.locator("tr", { hasText: email })).toBeVisible();
  await expect(page.locator("#table-f-status")).toHaveValue("qualified");
  await expect(page.locator("#table-from")).toHaveValue("2026-01-01");
  await page.goto(`/admin/submissions?status=won`);
  await expect(page.locator("tr", { hasText: email })).toHaveCount(0);

  // CSV export honours the same filters.
  const csv = await request.get(`${baseURL}/api/admin/submissions/export?status=qualified&tag=hot`);
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toBe("id,received_at,kind,status,name,email,company,service,intent,industry,tags,assignee,delivery_status,delivery_channel,spam_reason");
  expect(text).toContain(`Durable Enquiry,${email},E2E Ltd,,,,hot|follow-up,E2E inbox admin,failed,,`);
  const spamCsv = await request.get(`${baseURL}/api/admin/submissions/export?view=spam`).then((r) => r.text());
  expect(spamCsv.split("\r\n")[0]).toContain("spam_reason");

  // Viewer: read only.
  const viewer = await signedIn(browser, baseURL!, "viewer");
  expect((await post(viewer.request, baseURL!, viewer.csrf, "/api/admin/submissions/update", { id: row.id, status: "won" })).status()).toBe(403);
  await viewer.page.goto(`/admin/submissions/${row.id}`);
  await expect(viewer.page.getByRole("heading", { level: 1 })).toHaveText("Durable Enquiry");
  await expect(viewer.page.getByRole("button", { name: "Add note" })).toHaveCount(0);
  await viewer.context.close();
  void csrf;
  await context.close();
});

test("job applications cross-link into the inbox; digests and retention run from the cron", async ({ browser, baseURL, request }) => {
  const { context, request: admin, csrf, email: staffEmail } = await signedIn(browser, baseURL!);

  // An application row appears in the inbox with a link to the pipeline.
  const app = (await db().query<{ id: string; email: string }>(`select id, email from applications order by created_at desc limit 1`)).rows[0];
  if (app) {
    const linked = (await db().query<{ id: string; kind: string }>(`select id, kind from submissions where application_id = $1`, [app.id])).rows[0];
    if (linked) expect(linked.kind).toBe("application");
  }

  // Daily digest: a user on "daily" is due; the cron attempts it (the staff
  // address is a reserved test address, so attempted but never sent).
  await post(admin, baseURL!, csrf, "/api/admin/account/digest", { digest: "daily" });
  expect((await db().query<{ digest: string }>(`select digest from users where email = $1`, [staffEmail])).rows[0].digest).toBe("daily");
  const cron = await request.get(`${baseURL}/api/cron/publish`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(cron.status()).toBe(200);
  const result = await cron.json();
  expect(result.digests.due).toBeGreaterThanOrEqual(1);
  expect(result.digests.attempted).toBeGreaterThanOrEqual(1);
  expect(result.digests.sent).toBe(0);

  // Retention: shrink the window, plant an old enquiry, the cron purges it and audits the count.
  expect((await post(admin, baseURL!, csrf, "/api/admin/settings/retention", { submissionsMonths: 1, applicationsMonths: 24 })).status()).toBe(200);
  const oldEmail = `e2e-old-${RUN}@e2e-durability.invalid`;
  await db().query(`insert into submissions (kind, status, name, email, message, created_at) values ('contact', 'won', 'Old One', $1, 'ancient', now() - interval '2 months')`, [oldEmail]);
  const cron2 = await request.get(`${baseURL}/api/cron/publish`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect((await cron2.json()).purged.submissions).toBeGreaterThanOrEqual(1);
  expect((await db().query(`select 1 from submissions where email = $1`, [oldEmail])).rowCount).toBe(0);
  const purgeAudit = await db().query<{ after: { removed: number; olderThanMonths: number } }>(`select "after" from audit_log where action = 'submission.purge' order by created_at desc limit 1`);
  expect(purgeAudit.rows[0].after.olderThanMonths).toBe(1);
  // Recent rows survive.
  expect((await db().query(`select 1 from submissions where email = $1`, [`e2e-durable-${RUN}@e2e-durability.invalid`])).rowCount).toBe(1);
  // Back to the default so nothing else is affected.
  expect((await post(admin, baseURL!, csrf, "/api/admin/settings/retention", { submissionsMonths: 24, applicationsMonths: 24 })).status()).toBe(200);

  // Hard delete per row (admin only).
  const durable = (await rowFor(`e2e-durable-${RUN}@e2e-durability.invalid`))!;
  expect((await post(admin, baseURL!, csrf, "/api/admin/submissions/delete", { id: durable.id })).status()).toBe(200);
  expect((await db().query(`select 1 from submissions where id = $1`, [durable.id])).rowCount).toBe(0);
  await context.close();
});

test("inbox pages have no horizontal overflow at 360, 768 and 1280", async ({ browser, baseURL }) => {
  const { context, page } = await signedIn(browser, baseURL!);
  const honeypot = (await rowFor(`e2e-honeypot-${RUN}@e2e-durability.invalid`))!;
  const lines: string[] = [];
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/submissions", "/admin/submissions/spam", `/admin/submissions/${honeypot.id}`]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });
      const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      lines.push(`${width}px ${path.replace(honeypot.id, "<id>")}: scrollWidth=${scroll} clientWidth=${client}`);
      expect(scroll, `${path} overflows at ${width}px`).toBeLessThanOrEqual(client);
      expect(await page.locator("h1").count()).toBe(1);
    }
  }
  console.log(lines.join("\n"));
  await context.close();
});
