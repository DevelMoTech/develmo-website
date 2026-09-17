import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { apiLogin, cleanup, createUser, db, uniqueEmail, uniqueIp } from "./helpers/admin";

// The per-role feature grid at Security, Roles and access, and the webmail
// button on the users page.
//
// The grid is one setting for the whole console, so this file runs serially
// and puts the shipped defaults back through the API, which is what expires
// the cache the console reads it through.

const PASSWORD = "e2e-correct-horse-battery";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const ALL = [
  "content:read", "content:write", "media:read", "media:write",
  "submissions:read", "submissions:write", "seo:read", "seo:write",
  "security:read", "security:write", "performance:read", "performance:write",
  "users:read", "users:manage", "settings:read", "settings:write",
  "settings:owner", "owner:manage", "audit:read",
];
const SHIPPED_EDITOR = ["content:read", "content:write", "media:read", "media:write", "seo:read", "seo:write", "submissions:read"];
const SHIPPED_VIEWER = ALL.filter((p) => p.endsWith(":read"));

test.describe.configure({ mode: "serial" });

async function signedIn(browser: Browser, baseURL: string, role: "owner" | "admin" | "editor") {
  const email = uniqueEmail(`roles-${role}`);
  const mfa = role === "owner" || role === "admin";
  await createUser({ email, password: PASSWORD, role, name: `E2E roles ${role}`, totpSecret: mfa ? TOTP_SECRET : undefined });
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  const login = await apiLogin(context.request, baseURL, { email, password: PASSWORD });
  expect(login.status, `${role} password step`).toBe(200);
  if (mfa) {
    const verify = await context.request.post(`${baseURL}/api/admin/auth/mfa/verify`, {
      headers: { "x-csrf-token": login.csrf, "content-type": "application/json", origin: baseURL },
      data: { code: await generate({ secret: TOTP_SECRET }) },
    });
    expect(verify.status(), `${role} second factor`).toBe(200);
  }
  return { context, csrf: login.csrf, request: context.request, email };
}

function saveGrid(request: APIRequestContext, baseURL: string, csrf: string, roles: Record<string, string[]>) {
  return request.post(`${baseURL}/api/admin/security/roles`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL },
    data: { roles: { admin: [], editor: [], viewer: [], ...roles }, known: ALL },
  });
}

async function restoreShipped(browser: Browser, baseURL: string) {
  const owner = await signedIn(browser, baseURL, "owner");
  const res = await saveGrid(owner.request, baseURL, owner.csrf, { admin: ALL, editor: SHIPPED_EDITOR, viewer: SHIPPED_VIEWER });
  expect(res.status(), "put the shipped grid back").toBe(200);
  await owner.context.close();
  await db().query(`delete from settings where key = 'role_access'`);
}

test.afterAll(async ({ browser }) => {
  await restoreShipped(browser, process.env.E2E_BASE_URL || "http://localhost:3007");
  await cleanup();
});

test("the users page offers the Hostinger webmail, in a new tab and without leaking the console", async ({ browser, baseURL }) => {
  const admin = await signedIn(browser, baseURL!, "admin");
  const page = await admin.context.newPage();
  await page.goto("/admin/users");
  const link = page.getByRole("link", { name: "Open Hostinger webmail" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "https://mail.hostinger.com/auth/login");
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await link.getAttribute("rel")).toContain("noopener");
  const box = (await link.boundingBox())!;
  expect(box.height, "a real tap target").toBeGreaterThanOrEqual(36);
  await admin.context.close();
});

test("unticking a feature takes it off the sidebar, out of search and out of the API for that role", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const owner = await signedIn(browser, baseURL!, "owner");
  // An Editor who may no longer touch media, and may no longer read enquiries.
  const res = await saveGrid(owner.request, baseURL!, owner.csrf, {
    admin: ALL,
    editor: ["content:read", "content:write", "seo:read"],
    viewer: SHIPPED_VIEWER,
  });
  expect(res.status()).toBe(200);

  const editor = await signedIn(browser, baseURL!, "editor");
  const page = await editor.context.newPage();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  const sidebar = page.locator("#adm-sidebar");
  await expect(sidebar.getByRole("link", { name: "Posts" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Media" })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Submissions" })).toHaveCount(0);

  // The page itself refuses, not just the link.
  await page.goto("/admin/media");
  await expect(page).toHaveURL(/\/admin\?denied=media%3Aread/);

  // And so does the API behind it.
  const upload = await editor.request.post(`${baseURL}/api/admin/media/update`, {
    headers: { "x-csrf-token": editor.csrf, "content-type": "application/json", origin: baseURL! },
    data: { id: "00000000-0000-4000-8000-000000000000", altText: "x", folder: "", tags: [], filename: "x.png" },
  });
  expect(upload.status(), "media:write is gone, so this is forbidden not just hidden").toBe(403);

  // Search no longer offers what the role cannot open.
  const search = await editor.request.get(`${baseURL}/api/admin/search?q=media`);
  const hits = (await search.json()) as { hits: { href: string }[] };
  expect(hits.hits.some((h) => h.href.startsWith("/admin/media"))).toBe(false);

  await editor.context.close();
  await owner.context.close();
});

test("the grid cannot strand an Admin, promote an Editor, or hand out the Owner rows", async ({ browser, baseURL }) => {
  const owner = await signedIn(browser, baseURL!, "owner");
  // Ask for the worst of each: nothing for Admin, everything for Editor.
  const res = await saveGrid(owner.request, baseURL!, owner.csrf, { admin: [], editor: ALL, viewer: ALL });
  expect(res.status()).toBe(200);
  const saved = (await res.json()) as { role_access: { roles: Record<string, string[]> } };

  for (const p of ["users:read", "users:manage", "security:read", "security:write", "settings:read", "settings:write"]) {
    expect(saved.role_access.roles.admin, `Admin keeps ${p}`).toContain(p);
  }
  for (const role of ["editor", "viewer"]) {
    for (const p of ["settings:owner", "owner:manage", "users:manage", "security:write", "settings:write"]) {
      expect(saved.role_access.roles[role], `${role} is refused ${p}`).not.toContain(p);
    }
  }
  // An Admin really can still reach the two pages that put this right.
  const admin = await signedIn(browser, baseURL!, "admin");
  const page = await admin.context.newPage();
  await page.goto("/admin/security/roles");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roles and access");
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Users");
  await admin.context.close();
  await owner.context.close();
});

test("the grid page shows locked boxes, saves from the browser, and is audited", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const owner = await signedIn(browser, baseURL!, "owner");
  const page = await owner.context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/security/roles");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Roles and access");

  const row = page.locator("tr", { hasText: "Transfer ownership" });
  await expect(row.locator("input[type=checkbox]")).toHaveCount(3);
  for (const box of await row.locator("input[type=checkbox]").all()) {
    await expect(box).toBeDisabled();
    await expect(box).not.toBeChecked();
  }
  const floor = page.locator("tr", { hasText: "Invite, change roles and remove accounts" }).locator("input[type=checkbox]").first();
  await expect(floor).toBeDisabled();
  await expect(floor).toBeChecked();

  // Untick one real box and save.
  const auditRow = page.locator("tr", { hasText: "Read the audit log" });
  const viewerAudit = auditRow.locator("input[type=checkbox]").nth(2);
  await expect(viewerAudit).toBeChecked();
  await viewerAudit.uncheck();
  await page.getByRole("button", { name: "Save role access" }).click();
  await expect(page.getByText("Role access saved")).toBeVisible();

  const stored = await db().query<{ value: { roles: { viewer: string[] } } }>(`select value from settings where key = 'role_access'`);
  expect(stored.rows[0].value.roles.viewer).not.toContain("audit:read");
  const audited = await db().query(`select 1 from audit_log where action = 'security.role_access.update'`);
  expect(audited.rowCount).toBeGreaterThanOrEqual(1);
  await owner.context.close();
});
