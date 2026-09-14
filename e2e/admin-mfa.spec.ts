import { test, expect, type Browser } from "@playwright/test";
import { generate } from "otplib";
import { addRecoveryCodes, cleanup, createUser, db, securityEventCount, uiLogin, uniqueEmail, uniqueIp } from "./helpers/admin";

// The second factor prompt as a person meets it: which codes are accepted,
// what a refusal says, and that a recovery code signs in exactly once.
// Recovery codes had no coverage at the prompt before this file.

const PASSWORD = "e2e-correct-horse-battery";
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await cleanup();
});

async function fresh(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": uniqueIp() } });
  return { context, page: await context.newPage() };
}

test("a refusal says why, and a recovery code signs in exactly once", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("mfa-why");
  const userId = await createUser({ email, password: PASSWORD, role: "admin", totpSecret: TOTP_SECRET });
  await addRecoveryCodes(userId, ["ABCDE-FGHJK", "LMNPQ-RSTUV"]);
  const { context, page } = await fresh(browser);
  const field = page.locator("#mfa-code");
  const verify = page.getByRole("button", { name: "Verify" });
  const error = page.locator(".adm-alert-error");

  async function signIn() {
    await context.clearCookies();
    await page.goto("/admin/login");
    await uiLogin(page, { email, password: PASSWORD });
    await page.waitForURL("**/admin/mfa/verify**");
  }

  await signIn();
  // The right secret on a clock four minutes fast: the page says so.
  await field.fill(await generate({ secret: TOTP_SECRET, epoch: Math.floor(Date.now() / 1000) + 240 }));
  await verify.click();
  await expect(error).toContainText("about 4 minutes ahead");
  // Not a code of either kind.
  await field.fill("ABCDE-FGHJ");
  await verify.click();
  await expect(error).toContainText("in the form ABCDE-FGHJK");
  // A recovery code typed into the six digit field, lower case with a space: accepted whole.
  await field.fill("abcde fghjk");
  await verify.click();
  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");

  // The same recovery code again: each works once.
  await signIn();
  await field.fill("ABCDE-FGHJK");
  await verify.click();
  await expect(error).toContainText("each works once");
  // A code from the app signs in; the same code at the next sign in is a replay.
  const current = await generate({ secret: TOTP_SECRET });
  await field.fill(current);
  await verify.click();
  await page.waitForURL("**/admin");
  await signIn();
  await field.fill(current);
  await verify.click();
  await expect(error).toContainText("already been used");
  // The second recovery code still works.
  await field.fill("lmnpq-rstuv");
  await verify.click();
  await page.waitForURL("**/admin");

  expect(await securityEventCount("recovery_code_used", email)).toBe(2);
  expect(await securityEventCount("mfa_success", email)).toBe(1);
  const failed = await db().query<{ meta: Record<string, unknown> }>(`select meta from security_events where type = 'mfa_failed' and email = $1 order by created_at`, [email]);
  expect(failed.rows.map((r) => r.meta)).toEqual([
    expect.objectContaining({ kind: "totp", reason: "clock" }),
    expect.objectContaining({ kind: "unrecognised", reason: "malformed" }),
    expect.objectContaining({ kind: "recovery", reason: "no_match" }),
    expect.objectContaining({ kind: "totp", reason: "replay" }),
  ]);
  expect(Number(failed.rows[0].meta.driftSeconds)).toBeGreaterThanOrEqual(210);
  await context.close();
});

test("enrolment survives a reload, confirms with a code from the shown key, and is asked for at the next sign in", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("mfa-enrol");
  await createUser({ email, password: PASSWORD, role: "editor" });
  const { context, page } = await fresh(browser);
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: PASSWORD });
  await page.waitForURL("**/admin");

  // Optional for an Editor: the console did not send them here, they chose it.
  await page.goto("/admin/mfa/enrol");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Set up two-factor authentication");
  await expect(page.getByText("delete it first")).toBeVisible();
  await page.getByText("Cannot scan? Enter the key manually").click();
  const key = (await page.getByLabel("Manual setup key").textContent())!.trim();
  expect(key).toMatch(/^[A-Z2-7]{16,}$/);
  // A reload used to mint a new secret and silently orphan the entry just scanned.
  await page.reload();
  await page.getByText("Cannot scan? Enter the key manually").click();
  expect((await page.getByLabel("Manual setup key").textContent())!.trim()).toBe(key);

  // A wrong code says so; the right code from the shown key turns it on.
  const code = page.locator("#enrol-code");
  const wrong = String((Number(await generate({ secret: key })) + 1) % 1_000_000).padStart(6, "0");
  await code.fill(wrong);
  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await expect(page.locator(".adm-alert-error")).toContainText("not accepted");
  await code.fill(await generate({ secret: key }));
  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await expect(page.getByText("Two-factor authentication is on")).toBeVisible();
  const shown = await page.locator(".adm-codes li").allTextContents();
  expect(shown).toHaveLength(10);
  for (const c of shown) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

  // From now on the password alone is not enough, and a shown recovery code works.
  await context.clearCookies();
  await page.goto("/admin/login");
  await uiLogin(page, { email, password: PASSWORD });
  await page.waitForURL("**/admin/mfa/verify**");
  await page.locator("#mfa-code").fill(shown[3]);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/admin");
  expect(await securityEventCount("mfa_enrolled", email)).toBe(1);
  expect(await securityEventCount("recovery_code_used", email)).toBe(1);
  await context.close();
});
