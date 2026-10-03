import { expect, test, type Page } from "@playwright/test";

// The four products: the order they appear in, the pages themselves, and the
// claims the September 2026 product briefs say must not appear.

async function quiet(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
}

const ORDER = ["CrowdIQ", "PadelIQ", "DevelMoGPT", "AI Voice Agent"];

test("the products menu lists all four in order, and each card links to its page", async ({ page }) => {
  await page.goto("/");
  await quiet(page);
  const top = page.locator(".mega-top", { hasText: "Our Products" });
  await top.hover();
  const cards = top.locator(".mega-prodcard");
  await expect(cards).toHaveCount(4);
  const names = await cards.locator(".mpc-body b").allTextContents();
  expect(names.map((n) => n.trim())).toEqual(ORDER);

  const hrefs = await cards.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
  expect(hrefs).toEqual([
    "/our-products/crowdiq",
    "/our-products/padeliq",
    "/our-products/develmo-gpt",
    "/our-products/ai-voice-agent",
  ]);

  // Four across at desktop width, so nothing wraps onto a lonely second row.
  const tops = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, "all four cards share one row").toBe(1);
  // The two without a photo still show something, not an empty box.
  await expect(top.locator(".mpc-initial")).toHaveCount(2);
});

test("the products page lists all four with the right badges", async ({ page }) => {
  await page.goto("/our-products");
  await quiet(page);
  const cards = page.locator(".card.prod");
  await expect(cards).toHaveCount(4);
  const titles = await cards.locator("h3").allTextContents();
  expect(titles.map((t) => t.trim())).toEqual(ORDER);
  await expect(cards.nth(0).locator(".badge")).toHaveText("Live");
  await expect(cards.nth(1).locator(".badge")).toHaveText("Live");
  await expect(cards.nth(2).locator(".badge")).toHaveText("Coming soon");
  await expect(cards.nth(3).locator(".badge")).toHaveText("Coming soon");
});

test("PadelIQ states what it measures, and none of the claims the brief forbids", async ({ page }) => {
  await page.goto("/our-products/padeliq");
  await quiet(page);
  await expect(page.locator("h1")).toContainText("reads the game");

  // The metrics table, with its units.
  const rows = page.locator(".spec tbody tr");
  await expect(rows).toHaveCount(6);
  await expect(page.locator(".spec")).toContainText("Movement stability");
  await expect(page.locator(".spec")).toContainText("m/s");

  // The five step chain, and the league content that had to stay.
  await expect(page.locator(".flow .flow-step")).toHaveCount(5);
  await expect(page.getByText("Riyadh Padel Federation")).toBeVisible();
  await expect(page.getByText("110+")).toBeVisible();

  // Ball tracking is named as in development, not as a feature.
  await expect(page.getByText("In development", { exact: true })).toBeVisible();

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["reaction time", "rally pattern", "shot type", "ball speed"]) {
    expect(body, `the brief forbids "${forbidden}"`).not.toContain(forbidden);
  }
  // No accuracy figure: PadelIQ has not been benchmarked.
  expect(body).not.toMatch(/\d+\s*(%|percent)\s*(detection|accura)/);
});

test("DevelMoGPT asks for a demo, quotes no price, and links no repository", async ({ page }) => {
  await page.goto("/our-products/develmo-gpt");
  await quiet(page);
  await expect(page.locator("h1")).toContainText("never leave");
  await expect(page.getByRole("link", { name: "Book a demo" }).first()).toBeVisible();
  await expect(page.locator(".spec").first()).toContainText("FAISS");
  await expect(page.locator(".spec").nth(1)).toContainText("16 GB");

  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/github\.com/i);
  expect(body, "no price is set yet").not.toMatch(/\$\s?\d/);
  for (const forbidden of ["SOC 2", "ISO 27001", "HIPAA", "GDPR certified", "self learning", "production ready"]) {
    expect(body.toLowerCase(), `the brief forbids "${forbidden}"`).not.toContain(forbidden.toLowerCase());
  }
  const links = await page.locator("a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  expect(links.some((h) => h.includes("github"))).toBe(false);
});

test("the AI Voice Agent page carries the whole product document and no open questions", async ({ page }) => {
  await page.goto("/our-products/ai-voice-agent");
  await quiet(page);
  await expect(page.locator("h1")).toContainText("Real business actions");

  // Five tables: problem, integrations, control, use cases, benefits.
  await expect(page.locator(".spec")).toHaveCount(5);
  await expect(page.locator(".flow")).toHaveCount(3);
  await expect(page.getByText("Your data, your access rules")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a discovery call" }).first()).toBeVisible();

  const body = await page.locator("body").innerText();
  // The open questions in the source document are internal and unanswered.
  for (const forbidden of ["Open Questions", "per minute", "monthly retainer", "data residency"]) {
    expect(body.toLowerCase(), `internal or undecided: "${forbidden}"`).not.toContain(forbidden.toLowerCase());
  }
  expect(body, "no price is set yet").not.toMatch(/\$\s?\d/);
});
