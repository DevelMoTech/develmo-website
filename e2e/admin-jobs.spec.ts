import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";
import { validateJobPosting } from "../src/lib/jobposting";

const PASSWORD = "e2e-correct-horse-battery";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

test.describe.configure({ mode: "serial" });

const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

// Admins must have TOTP enrolled, so an admin session completes the MFA
// challenge through the same API the console uses.
async function signedIn(browser: Browser, baseURL: string, role: "editor" | "viewer" | "admin" = "editor") {
  const email = uniqueEmail(`jobs-${role}`);
  await createUser({ email, password: PASSWORD, role, name: `E2E ${role}`, totpSecret: role === "admin" ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status).toBe(200);
  if (role === "admin") {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
      headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL },
      data: { code: await generate({ secret: TOTP_SECRET }) },
    });
    expect(verify.status()).toBe(200);
  }
  const page = await context.newPage();
  return { context, page, email, csrf: login.csrf, request: context.request };
}

function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: Record<string, unknown>) {
  return request.post(`${baseURL}${path}`, { headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL }, data });
}

function apply(request: APIRequestContext, baseURL: string, fields: Record<string, string>, cv: { name: string; mimeType: string; buffer: Buffer } | null, ip = uniqueIp()) {
  return request.post(`${baseURL}/api/jobs/apply`, {
    headers: { "x-forwarded-for": ip },
    multipart: { name: "Ada Lovelace", email: `e2e-applicant-${RUN}@example.com`, consent: "true", locale: "en", ...fields, ...(cv ? { cv } : {}) },
  });
}

const SLUG = `e2e-${RUN}-computer-vision-engineer`;
const stripScripts = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

// With reCAPTCHA keys configured locally the API verifies tokens for real,
// so API-level submissions mint a genuine single-use token in a browser page.
async function mintToken(browser: Browser, baseURL: string): Promise<string> {
  if (!SITE_KEY) return "";
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/jobs/${SLUG}`);
  await page.waitForFunction(() => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined");
  const token = await page.evaluate(
    ([key]) => new Promise<string>((resolve) => (window as unknown as { grecaptcha: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.ready(() => (window as unknown as { grecaptcha: { execute: (k: string, o: { action: string }) => Promise<string> } }).grecaptcha.execute(key, { action: "apply" }).then(resolve))),
    [SITE_KEY],
  );
  await context.close();
  return token;
}

test.afterAll(async () => {
  // Scoped to this worker's run: a retried serial group starts a new worker,
  // and the old worker's teardown must not delete the new worker's rows.
  await db().query(`delete from submissions where application_id in (select id from applications where job_id in (select id from jobs where slug like $1))`, [`e2e-${RUN}-%`]);
  await db().query(`delete from applications where job_id in (select id from jobs where slug like $1)`, [`e2e-${RUN}-%`]);
  await db().query(`delete from jobs where slug like $1`, [`e2e-${RUN}-%`]);
  await cleanup();
});

test("create and open a job in the editor; /jobs and /jobs/<slug> render it with valid JobPosting JSON-LD", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const { context, page, request } = await signedIn(browser, baseURL!);
  await page.setViewportSize({ width: 1280, height: 900 });
  const before = await request.get(`${baseURL}/jobs`).then((r) => r.text());
  expect(before).not.toContain(`/jobs/${SLUG}`);

  await page.goto("/admin/jobs/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New job");
  await page.getByLabel("Title", { exact: true }).fill(`E2E ${RUN} Computer Vision Engineer`);
  await expect(page.getByLabel("Slug", { exact: true })).toHaveValue(SLUG);
  await expect(page.locator("#j-slug-status")).toContainText(`Available: /jobs/${SLUG}`);
  await page.getByLabel("Department", { exact: true }).fill("Engineering");
  await page.getByLabel("Office", { exact: true }).selectOption("UK");
  await page.getByLabel("City or area").fill("London");
  await page.getByLabel("Summary", { exact: true }).fill("Build detection and tracking models that run on real cameras for real clients, from first prototype to production rollout.");
  await page.getByLabel("Responsibilities", { exact: true }).fill("- Train and evaluate detection models\n- Ship them to the edge\n\n<script>alert(1)</script>");
  await page.getByLabel("Requirements", { exact: true }).fill("- PyTorch\n- Production experience");
  await page.getByLabel("Minimum", { exact: true }).fill("70000");
  await page.getByLabel("Maximum", { exact: true }).fill("90000");
  await page.getByLabel("Status", { exact: true }).selectOption("open");
  const closes = new Date(Date.now() + 30 * 86400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByLabel("Closes at").fill(`${closes.getFullYear()}-${pad(closes.getMonth() + 1)}-${pad(closes.getDate())}T09:00`);
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(/\/admin\/jobs\/[0-9a-f-]{36}$/);
  // The editor validates the structured data with the same code the page uses.
  await expect(page.locator(".adm-alert-success")).toContainText("JobPosting structured data is valid and complete");

  // Listed on the careers page, with its card linking to the detail route.
  const list = await request.get(`${baseURL}/jobs`).then((r) => r.text());
  expect(list).toContain(`href="/jobs/${SLUG}"`);
  expect(list).toContain("View role");
  expect(list).toContain("Engineering · London · Full-time");

  const res = await request.get(`${baseURL}/jobs/${SLUG}`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(`<h1>E2E ${RUN} Computer Vision Engineer</h1>`);
  expect(html).toContain(`<title>E2E ${RUN} Computer Vision Engineer | DevelMo</title>`);
  expect(html).toContain("<li>Train and evaluate detection models</li>");
  expect(html).not.toContain("alert(1)");
  expect(html).toContain("£70,000 to £90,000 per year");
  const ldMatch = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"JobPosting".*?)<\/script>/);
  expect(ldMatch, "JobPosting JSON-LD present").toBeTruthy();
  const ld = JSON.parse(ldMatch![1]);
  expect(validateJobPosting(ld)).toEqual({ errors: [], warnings: [] });
  expect(ld.title).toBe(`E2E ${RUN} Computer Vision Engineer`);
  expect(ld.jobLocation.address).toEqual({ "@type": "PostalAddress", addressCountry: "GB", addressLocality: "London", addressRegion: "England" });
  expect(ld.baseSalary.value).toEqual({ "@type": "QuantitativeValue", unitText: "YEAR", minValue: 70000, maxValue: 90000 });
  expect(ld.description).toContain("<li>Train and evaluate detection models</li>");
  expect(ld.description).not.toContain("script");
  expect(ld.url).toBe(`https://develmo.com/jobs/${SLUG}`);
  // The description is the sanitized posting; the page's own form is present.
  expect(html).toContain('id="ja-cv"');
  await context.close();
});

test("the public application form submits with a CV; the row, trail and signed CV download appear in the console", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  // No extra headers on this context: Playwright would add them to the
  // cross-origin reCAPTCHA script request too and trip CORS.
  const applicant = await browser.newContext();
  const page = await applicant.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/jobs/${SLUG}`);
  await page.getByLabel("Full name").fill("Grace Hopper");
  await page.locator("#ja-email").fill(`e2e-grace-${RUN}@example.com`);
  await page.getByLabel("Phone").fill("+44 20 7946 0000");
  await page.getByLabel("Location").fill("Bristol");
  await page.getByLabel("LinkedIn profile").fill("https://www.linkedin.com/in/grace");
  await page.getByLabel("Cover note").fill("I built the compiler. Happy to build your vision pipeline.");
  await page.getByLabel("CV (PDF or DOCX, up to 10 MB)").setInputFiles({ name: "grace-cv.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByLabel(/I agree to DevelMo storing my details and CV/).check();
  // reCAPTCHA v3 runs for real here (keys are set locally): wait for api.js
  // like a slow human would, then allow for the Google round trips.
  if (SITE_KEY) await page.waitForFunction(() => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== "undefined", null, { timeout: 30_000 });
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.locator(".form-success")).toContainText("Your application is in", { timeout: 45_000 });
  await applicant.close();

  const row = (await db().query<{ id: string; stage: string; cv_blob_key: string; cv_content_type: string; cv_filename: string; consent_at: Date | null; ack_error: string | null; ack_sent_at: Date | null; locale: string }>(`select id, stage, cv_blob_key, cv_content_type, cv_filename, consent_at, ack_error, ack_sent_at, locale from applications where email = $1`, [`e2e-grace-${RUN}@example.com`])).rows[0];
  expect(row).toBeTruthy();
  expect(row.stage).toBe("new");
  expect(row.cv_blob_key).toMatch(/^cv-[a-f0-9]{32}\.pdf$/);
  expect(row.cv_content_type).toBe("application/pdf");
  expect(row.cv_filename).toBe("grace-cv.pdf");
  expect(row.consent_at).toBeTruthy();
  expect(row.locale).toBe("en");
  // Acknowledgement was attempted after the response; an example.com applicant is a reserved test address, so it is recorded as not sent.
  await expect.poll(async () => (await db().query<{ ack_error: string | null }>(`select ack_error from applications where id = $1`, [row.id])).rows[0].ack_error).toContain("reserved test address");
  const events = await db().query<{ to_stage: string; note: string }>(`select to_stage, note from application_events where application_id = $1`, [row.id]);
  expect(events.rows).toEqual([{ to_stage: "new", note: "Submitted through the careers page" }]);

  // The CV is never public: the bare storage URL 404s.
  const anon = await browser.newContext();
  expect((await anon.request.get(`${baseURL}/media/${row.cv_blob_key}`)).status()).toBe(404);
  await anon.close();

  // Console: listed, detail page, signed download.
  const { context, page: admin, request, email } = await signedIn(browser, baseURL!);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto("/admin/applications");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Applications");
  await admin.getByRole("link", { name: "Grace Hopper" }).click();
  await admin.waitForURL(`**/admin/applications/${row.id}`);
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Grace Hopper");
  await expect(admin.getByText("grace-cv.pdf")).toBeVisible();
  const link = await request.get(`${baseURL}/api/admin/applications/cv?id=${row.id}`).then((r) => r.json());
  expect(link.ok).toBe(true);
  expect(link.url).toMatch(/^\/media\/cv-[a-f0-9]{32}\.pdf\?download=1&exp=\d+&sig=[a-f0-9]{64}$/);
  const dl = await request.get(`${baseURL}${link.url}`);
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-type"]).toBe("application/pdf");
  expect(dl.headers()["content-disposition"]).toContain("attachment");
  expect((await dl.body()).equals(PDF)).toBe(true);
  expect((await request.get(`${baseURL}${link.url.replace(/sig=[a-f0-9]{64}/, `sig=${"0".repeat(64)}`)}`)).status()).toBe(404);
  const audited = await db().query<{ n: string }>(`select count(*)::text as n from audit_log where action = 'application.cv_download' and entity_id = $1 and actor_email = $2`, [row.id, email]);
  expect(Number(audited.rows[0].n)).toBe(1);
  await context.close();
});

test("protections: honeypot, sniffed CV type, rate limit, closed job", async ({ baseURL, request, browser }) => {
  test.setTimeout(120_000);
  const ip = uniqueIp();
  // Honeypot: accepted silently, nothing stored, event recorded.
  const before = Number((await db().query<{ n: string }>(`select count(*)::text as n from security_events where type = 'honeypot' and path = '/api/jobs/apply'`)).rows[0].n);
  const hp = await apply(request, baseURL!, { jobSlug: SLUG, company_url: "http://spam.example" }, { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF }, ip);
  expect(hp.status()).toBe(200);
  expect((await db().query(`select 1 from applications where email = $1`, [`e2e-applicant-${RUN}@example.com`])).rowCount).toBe(0);
  const after = Number((await db().query<{ n: string }>(`select count(*)::text as n from security_events where type = 'honeypot' and path = '/api/jobs/apply'`)).rows[0].n);
  expect(after).toBe(before + 1);

  // An executable renamed to .docx, a text file, and a scripted PDF are all refused from their bytes.
  for (const cv of [
    { name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("MZ\x90\0this is not a document") },
    { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some text") },
    { name: "cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>") },
  ]) {
    const res = await apply(request, baseURL!, { jobSlug: SLUG, recaptchaToken: await mintToken(browser, baseURL!) }, cv, uniqueIp());
    expect(res.status()).toBe(415);
    expect((await res.json()).code).toBe("cv_type");
  }
  // Missing consent and missing CV.
  expect((await apply(request, baseURL!, { jobSlug: SLUG, consent: "false" }, { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF }, uniqueIp())).status()).toBe(400);
  expect((await apply(request, baseURL!, { jobSlug: SLUG, recaptchaToken: await mintToken(browser, baseURL!) }, null, uniqueIp())).status()).toBe(400);
  // Unknown or closed job.
  expect((await apply(request, baseURL!, { jobSlug: `e2e-${RUN}-nope` }, { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF }, uniqueIp())).status()).toBe(404);

  // Durable limiter: 5 per 10 minutes per IP, the sixth is 429.
  const limiterIp = uniqueIp();
  let last = 0;
  for (let i = 0; i < 6; i++) {
    const res = await apply(request, baseURL!, { jobSlug: SLUG, email: `e2e-limit-${RUN}-${i}@example.com` }, { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF }, limiterIp);
    last = res.status();
  }
  expect(last).toBe(429);
});

test("pipeline: stage changes with a trail, rating, assignment, notes, rejection email, CSV export, viewer denied", async ({ browser, baseURL }) => {
  const { context, page, request, csrf, email } = await signedIn(browser, baseURL!, "admin");
  const app = (await db().query<{ id: string }>(`select id from applications where email = $1`, [`e2e-grace-${RUN}@example.com`])).rows[0];
  const staffId = (await db().query<{ id: string }>(`select id from users where email = $1`, [email])).rows[0].id;

  // Stage with a note.
  const stage = await post(request, baseURL!, csrf, "/api/admin/applications/stage", { id: app.id, stage: "screening", note: "Strong CV" });
  expect(stage.status()).toBe(200);
  expect((await stage.json()).changed).toBe(true);
  const again = await post(request, baseURL!, csrf, "/api/admin/applications/stage", { id: app.id, stage: "screening" });
  expect((await again.json()).changed).toBe(false);
  expect((await post(request, baseURL!, csrf, "/api/admin/applications/rating", { id: app.id, rating: 4 })).status()).toBe(200);
  expect((await post(request, baseURL!, csrf, "/api/admin/applications/assign", { id: app.id, assigneeId: staffId })).status()).toBe(200);
  expect((await post(request, baseURL!, csrf, "/api/admin/applications/assign", { id: app.id, assigneeId: "3f0e2c7a-4a3e-4a6b-9a4f-0c8f2f7d1b2e" })).status()).toBe(400);
  expect((await post(request, baseURL!, csrf, "/api/admin/applications/note", { id: app.id, body: "Phone screen booked for Monday." })).status()).toBe(200);

  // The detail page shows the trail, note, rating and assignee.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/applications/${app.id}`);
  await expect(page.getByText("new to screening: Strong CV")).toBeVisible();
  await expect(page.getByText("Phone screen booked for Monday.")).toBeVisible();
  await expect(page.getByLabel("4 of 5")).toBeVisible();
  await expect(page.getByLabel("Assigned to")).toHaveValue(staffId);
  // Move to interview through the UI.
  await page.getByLabel("Move to").selectOption("interview");
  await page.getByLabel("Note for the trail").fill("Panel on Thursday");
  await page.getByRole("button", { name: "Change stage" }).click();
  await expect(page.getByText("Moved to Interview")).toBeVisible();
  await expect(page.getByText("screening to interview: Panel on Thursday")).toBeVisible({ timeout: 15_000 });

  // Rejection from the editable template (the applicant is a reserved test address: recorded, not sent).
  await page.getByRole("button", { name: "Send rejection" }).click();
  const dialog = page.locator("#reject-application");
  await expect(dialog.getByLabel("Subject")).toHaveValue(/Your application for/);
  await dialog.getByLabel("Message").fill("Hi {{first_name}}, thank you for applying for {{job}}. We will not take it further. The {{company}} team");
  await dialog.getByRole("button", { name: "Send and mark rejected" }).click();
  await expect(page.getByText("Moved to Rejected, email not sent")).toBeVisible();
  const trail = await db().query<{ to_stage: string; note: string }>(`select to_stage, note from application_events where application_id = $1 order by created_at`, [app.id]);
  expect(trail.rows.map((r) => r.to_stage)).toEqual(["new", "screening", "interview", "rejected"]);
  expect(trail.rows[3].note).toContain("email not sent");
  const audit = await db().query<{ action: string }>(`select action from audit_log where entity_type = 'application' and entity_id = $1 order by created_at`, [app.id]);
  expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["application.stage", "application.rate", "application.assign", "application.note", "application.reject_email"]));

  // CSV export for the job, same filters as the page.
  const job = (await db().query<{ id: string }>(`select id from jobs where slug = $1`, [SLUG])).rows[0];
  const csv = await request.get(`${baseURL}/api/admin/applications/export?job=${job.id}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toBe("id,submitted_at,job,job_slug,name,email,location,stage,rating,assignee,cv_filename");
  expect(text).toContain(`Grace Hopper,e2e-grace-${RUN}@example.com,Bristol,rejected,4,E2E admin,grace-cv.pdf`);
  await context.close();

  // Viewers read but never write; editors cannot hard delete.
  const viewer = await signedIn(browser, baseURL!, "viewer");
  expect((await post(viewer.request, baseURL!, viewer.csrf, "/api/admin/applications/stage", { id: app.id, stage: "hired" })).status()).toBe(403);
  await viewer.page.goto(`/admin/applications/${app.id}`);
  await expect(viewer.page.getByRole("heading", { level: 1 })).toHaveText("Grace Hopper");
  await expect(viewer.page.getByRole("button", { name: "Change stage" })).toHaveCount(0);
  await viewer.context.close();
  const editor = await signedIn(browser, baseURL!, "editor");
  expect((await post(editor.request, baseURL!, editor.csrf, "/api/admin/applications/delete", { id: app.id })).status()).toBe(403);
  await editor.context.close();
});

test("locale leak check and responsive check on /jobs and /jobs/<slug>, LTR and RTL", async ({ browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const sentinels = ["Apply for this role", "Role details", "Send application", "Full name", "View role", "Open roles", "Employment type", "What we offer", "What you will do", "Cover note", "Careers", "Home"];
  const strip = (h: string) => h.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  for (const locale of ["ar", "fr"]) {
    for (const path of ["/jobs", `/jobs/${SLUG}`]) {
      const html = await request.get(`${baseURL}${path}`, { headers: { cookie: `locale=${locale}` } }).then((r) => r.text());
      const body = strip(html);
      const leaks = sentinels.filter((s) => new RegExp(`(^|[>\\s"(])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([<\\s".,:!?)]|$)`).test(body));
      expect(leaks, `${locale} ${path} leaks`).toEqual([]);
      if (locale === "ar") expect(html).toContain('dir="rtl"');
    }
  }

  const lines: string[] = [];
  for (const locale of ["en", "ar"]) {
    const context = await browser.newContext();
    await context.addCookies([{ name: "locale", value: locale, domain: "localhost", path: "/" }]);
    const page = await context.newPage();
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/jobs", `/jobs/${SLUG}`]) {
        await page.goto(path, { waitUntil: "load" });
        await expect(page.locator("main h1")).toBeVisible();
        const { scroll, client, dir } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, dir: document.documentElement.dir }));
        lines.push(`${locale} (${dir || "ltr"}) ${width}px ${path.replace(SLUG, "<slug>")}: scrollWidth=${scroll} clientWidth=${client}`);
        expect(scroll, `${path} overflows at ${width}px (${locale})`).toBeLessThanOrEqual(client);
        expect(await page.locator("h1").count()).toBe(1);
        if (locale === "ar") expect(dir).toBe("rtl");
      }
    }
    await context.close();
  }
  console.log(lines.join("\n"));
});

test("closing the job removes it from /jobs, the detail route 404s with the role-closed page, and a job with applications cannot be deleted", async ({ browser, baseURL }) => {
  const { context, page, request, csrf } = await signedIn(browser, baseURL!);
  const job = (await db().query<{ id: string }>(`select id from jobs where slug = $1`, [SLUG])).rows[0];
  const jobPayload = { title: `E2E ${RUN} Computer Vision Engineer`, slug: SLUG, employmentType: "full-time", remotePolicy: "hybrid", salaryCurrency: "GBP", officeCode: "UK", summaryMd: "Build detection and tracking models that run on real cameras for real clients, from first prototype to production rollout." };
  expect((await post(request, baseURL!, csrf, "/api/admin/jobs/delete", { id: job.id })).status()).toBe(409);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/admin/jobs/${job.id}`);
  await expect(page.getByRole("button", { name: "Delete job" })).toBeDisabled();
  // The datetime fields are filled in by the client, so a value there means
  // the editor has hydrated and the select change will reach React state.
  await expect(page.getByLabel("Closes at")).not.toHaveValue("");
  await page.getByLabel("Status", { exact: true }).selectOption("closed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const list = await request.get(`${baseURL}/jobs`).then((r) => r.text());
  expect(list).not.toContain(`/jobs/${SLUG}`);
  // With this role closed the careers page is exactly what it was before the
  // role was opened (the paused copy is taken in this same attempt).
  const reopened = await post(request, baseURL!, csrf, "/api/admin/jobs/update", { ...jobPayload, id: job.id, status: "open" });
  expect(reopened.status()).toBe(200);
  expect(await request.get(`${baseURL}/jobs`).then((r) => r.text())).toContain(`/jobs/${SLUG}`);
  const reclosed = await post(request, baseURL!, csrf, "/api/admin/jobs/update", { ...jobPayload, id: job.id, status: "closed" });
  expect(reclosed.status()).toBe(200);
  expect(stripScripts(await request.get(`${baseURL}/jobs`).then((r) => r.text()))).toBe(stripScripts(list));
  const detail = await request.get(`${baseURL}/jobs/${SLUG}`);
  expect(detail.status()).toBe(404);
  const html = await detail.text();
  expect(html).toContain("This role is no longer open.");
  expect(html).not.toContain('"@type":"JobPosting"');
  expect((await apply(request, baseURL!, { jobSlug: SLUG }, { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF })).status()).toBe(404);
  expect((await db().query<{ action: string }>(`select action from audit_log where entity_type = 'job' and entity_id = $1 order by created_at desc limit 1`, [job.id])).rows[0].action).toBe("job.close");

  // The cron closes roles whose closing time has passed.
  const dueSlug = `e2e-${RUN}-due`;
  await db().query(`insert into jobs (slug, title, status, opened_at, closes_at, summary_md) values ($1, 'E2E due', 'open', now() - interval '2 days', now() - interval '1 minute', 'x')`, [dueSlug]);
  expect((await request.get(`${baseURL}/jobs/${dueSlug}`)).status()).toBe(404);
  const cron = await request.get(`${baseURL}/api/cron/publish`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect((await cron.json()).closedJobs).toContain(dueSlug);
  expect((await db().query<{ status: string }>(`select status from jobs where slug = $1`, [dueSlug])).rows[0].status).toBe("closed");
  await context.close();
});
