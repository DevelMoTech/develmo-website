import { expect, test, type Page } from "@playwright/test";

// The Company Advisory Board page. The content is about two real, named
// people, so the checks here are mostly about not misrepresenting them: the
// bios intact, no dead profile link, and no claim the draft does not make.

async function quiet(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
}

test("the board page carries both members, their areas and the four pillars", async ({ page }) => {
  await page.goto("/who-we-are/advisory-board");
  await quiet(page);

  await expect(page.locator("h1")).toHaveText("Guiding DevelMo's Next Chapter");

  const pillars = page.locator(".pillar");
  await expect(pillars).toHaveCount(4);
  await expect(pillars.locator("h3")).toHaveText([
    "Technology Strategy",
    "Enterprise & Telecom",
    "Cloud & AI Infrastructure",
    "Growth & Innovation",
  ]);

  const advisors = page.locator(".advisor");
  await expect(advisors).toHaveCount(2);
  await expect(advisors.locator(".adv-body h3")).toHaveText(["Ali Murtaza", "Muhammad Rashid Anwar"]);
  await expect(advisors.nth(0).locator(".adv-role")).toHaveText("Cloud, AI Infrastructure & Digital Transformation");
  await expect(advisors.nth(1).locator(".adv-role")).toHaveText("Telecommunications, AI & Future Networks");
  await expect(advisors.nth(0).locator(".adv-areas li")).toHaveCount(5);
  await expect(advisors.nth(1).locator(".adv-areas li")).toHaveCount(6);

  // The experience figures are the members' own, and must not drift.
  await expect(advisors.nth(0)).toContainText("more than 17 years");
  await expect(advisors.nth(1)).toContainText("20 years of industry experience");

  // Each monogram is decorative; the name beside it is what gets read out.
  const monos = page.locator(".adv-mono");
  await expect(monos).toHaveCount(2);
  for (const m of await monos.all()) expect(await m.getAttribute("aria-hidden")).toBe("true");
});

test("the board page links nowhere dead, and names no withdrawn product", async ({ page }) => {
  await page.goto("/who-we-are/advisory-board");
  await quiet(page);

  // OmniRoad is named in the source draft and is withdrawn from the site.
  await expect(page.locator("body")).not.toContainText("OmniRoad");

  // The LinkedIn link is rendered only once a real profile URL is set, so an
  // unset one can never ship as a link to nowhere.
  const links = await page.locator("a[href]").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
  expect(links.filter((h) => h === "" || h === "#"), "no placeholder hrefs").toEqual([]);
  for (const link of await page.locator(".adv-link").all()) {
    expect(await link.getAttribute("href"), "a rendered profile link points at LinkedIn").toContain("linkedin.com");
  }

  // Person schema for each member, and sameAs only when there is a real URL.
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const people = blocks.flatMap((b) => { const v = JSON.parse(b); return Array.isArray(v) ? v : [v]; }).filter((v) => v["@type"] === "Person");
  expect(people).toHaveLength(2);
  expect(people.map((p) => p.name)).toEqual(["Ali Murtaza", "Muhammad Rashid Anwar"]);
  for (const p of people) {
    expect(p.description.length, "the bio is carried into the schema").toBeGreaterThan(100);
    if (p.sameAs) for (const u of p.sameAs) expect(u).toMatch(/^https:\/\//);
  }
});

test("the board is reachable from the header and the footer", async ({ page }) => {
  await page.goto("/");
  await quiet(page);
  const top = page.locator(".mega-top", { hasText: "Who We Are" });
  await top.hover();
  await expect(top.getByRole("link", { name: "Advisory Board" })).toBeVisible();
  await expect(page.locator(".footer").getByRole("link", { name: "Advisory Board" })).toHaveAttribute(
    "href",
    "/who-we-are/advisory-board",
  );
});

test("the board page fits a phone and keeps its hairline grid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/who-we-are/advisory-board");
  await quiet(page);
  const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(doc.sw, "no horizontal page scroll").toBeLessThanOrEqual(doc.cw + 1);

  // One column on a phone, four cells still.
  const tops = await page.locator(".pillar").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, "the pillars stack").toBe(4);
});
