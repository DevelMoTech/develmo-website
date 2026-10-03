import { expect, test, type Page } from "@playwright/test";

// The public-site half of this round of work: the client logo marquee, the
// CrowdIQ price, the footer columns, the products mega menu, the header that
// gets out of the way on the way down, and OmniRoad being gone.

async function quiet(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(250);
}

test("the logo marquee shows each brand in one row only, both rows loop, and the logos are big enough to read", async ({ page }) => {
  await page.goto("/");
  await quiet(page);

  const rows = page.locator(".clients-row");
  await expect(rows).toHaveCount(2);

  // Every brand belongs to exactly one row. The repeats inside a row are what
  // makes the loop seamless and are hidden from screen readers.
  const named = async (i: number) =>
    (await rows.nth(i).locator(".client-tile:not([data-dup]) img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).alt))).sort();
  const top = await named(0);
  const bottom = await named(1);
  expect(top.length).toBeGreaterThan(0);
  expect(bottom.length).toBeGreaterThan(0);
  expect(top.filter((n) => bottom.includes(n)), "no brand appears in both rows").toEqual([]);
  for (const alt of [...top, ...bottom]) expect(alt.trim(), "every first-pass logo is named").not.toBe("");
  const dupAlts = await page.locator('.client-tile[data-dup="true"] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).alt));
  expect(new Set(dupAlts), "the repeats are decorative").toEqual(new Set([""]));

  // Both rows are animated, in opposite directions, and slowly.
  const anims = await rows.evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, duration: Number.parseFloat(cs.animationDuration) };
    }),
  );
  expect(anims[0].name).toBe("marq");
  expect(anims[1].name).toBe("marq-rev");
  for (const a of anims) expect(a.duration, "a slow loop").toBeGreaterThan(60);

  // One pass of a row is wider than the screen, or the loop shows a gap.
  const gaps = await rows.evaluateAll((els) =>
    els.map((el) => {
      const total = (el as HTMLElement).scrollWidth;
      return { pass: total / 2, viewport: window.innerWidth };
    }),
  );
  for (const g of gaps) expect(g.pass, "one pass covers the viewport").toBeGreaterThan(g.viewport);

  // Bigger than the 64px cap the tiles used to impose, on desktop and phone.
  const logoHeight = async () => (await page.locator(".client-logo").first().boundingBox())!.height;
  expect(await logoHeight()).toBeGreaterThan(64);
  await page.setViewportSize({ width: 360, height: 780 });
  await quiet(page);
  const tile = (await page.locator(".client-tile").first().boundingBox())!;
  expect(tile.width, "the phone tile did not shrink below the old one").toBeGreaterThan(180);
  expect(await logoHeight(), "the phone logo is bigger than the old 64px cap").toBeGreaterThan(64);
});

test("CrowdIQ Business is 99 a month, with 199 struck through", async ({ page }) => {
  await page.goto("/our-products/crowdiq");
  const plan = page.locator(".card.price", { hasText: "Business" });
  await expect(plan.locator(".amt")).toContainText("$99");
  await expect(plan.locator(".was")).toHaveText("$199");
  await expect(plan.locator(".amt")).not.toContainText("$299");
  // The strike is a real line through, not just smaller text.
  await expect(plan.locator(".was")).toHaveCSS("text-decoration-line", "line-through");
});

test("the use cases section offers the catalogue, and the file really downloads", async ({ page, request }) => {
  await page.goto("/our-products/crowdiq");
  const section = page.locator("section", { hasText: "Where CrowdIQ delivers" }).last();
  const link = section.getByRole("link", { name: "View More Details" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/crowdiq/develmo-crowdiq-catalog.pdf");
  // A saved file, not a navigation, and under a name that means something in
  // somebody's downloads folder.
  await expect(link).toHaveAttribute("download", "DevelMo-CrowdIQ-Catalog.pdf");
  await expect(section.getByText("The full CrowdIQ catalogue, as a PDF")).toBeVisible();
  const box = (await link.boundingBox())!;
  expect(box.height, "a real tap target").toBeGreaterThanOrEqual(44);

  // The file behind it is served, and is a PDF rather than a 404 page.
  const res = await request.get("/crowdiq/develmo-crowdiq-catalog.pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("pdf");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.byteLength, "the whole catalogue, not a truncated copy").toBeGreaterThan(1_000_000);

  // Clicking it saves the file rather than leaving the page.
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("DevelMo-CrowdIQ-Catalog.pdf");
  expect(page.url()).toContain("/our-products/crowdiq");
});

test("the footer has no Who We Help column and still lists the rest", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer.footer");
  const headings = await footer.locator(".foot-grid h5").allTextContents();
  expect(headings.map((h) => h.trim())).toEqual(["What We Do", "Products", "Company"]);
  await expect(footer.getByRole("link", { name: "Healthcare & Pharmaceuticals" })).toHaveCount(0);
  // The section itself is still reachable from the header.
  await expect(page.locator(".mega-nav").getByRole("link", { name: "Who We Help" }).first()).toBeVisible();
});

test("the products mega menu shows a picture per product, and only fetches them once opened", async ({ page }) => {
  // Only the CrowdIQ still is counted: PadelIQ reuses /hero-1.jpg, which the
  // page's own hero already loads as a poster, so the menu costs nothing for
  // that one either way. DevelMoGPT and the AI Voice Agent have no photograph
  // yet and show a brand coloured initial instead, which costs no request at
  // all.
  const shots: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/crowdiq/showcase.jpg") shots.push(r.url());
  });
  await page.goto("/");
  await quiet(page);
  expect(shots, "a closed panel costs the visitor nothing").toEqual([]);

  await page.locator(".mega-top", { hasText: "Our Products" }).hover();
  const panel = page.locator(".mega-top", { hasText: "Our Products" }).locator(".mega-panel");
  await expect(panel).toBeVisible();
  const cards = panel.locator(".mega-prodcard");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator(".mpc-shot img")).toHaveCount(2);
  await expect(cards.locator(".mpc-initial")).toHaveCount(2);
  for (const card of await cards.all()) {
    const box = (await card.locator(".mpc-shot").boundingBox())!;
    expect(box.height, "the picture fills real space").toBeGreaterThan(80);
  }
  await expect.poll(() => shots.length, { timeout: 10_000 }).toBe(1);
  // CrowdIQ is named once in the panel, not twice.
  expect(await panel.getByText("CrowdIQ", { exact: true }).count()).toBe(1);
});

test("the header hides on the way down and comes back on the way up", async ({ page }) => {
  await page.goto("/");
  await quiet(page);
  const header = page.locator("header.mega");
  await expect(header).not.toHaveClass(/\bhide\b/);

  await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" as ScrollBehavior }));
  await expect(header).toHaveClass(/\bhide\b/);
  // Sticky, not gone: it is still in the layout, just parked above the fold.
  await expect(header).toHaveCSS("position", "sticky");

  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" as ScrollBehavior }));
  await expect(header).not.toHaveClass(/\bhide\b/);
  const box = (await header.boundingBox())!;
  expect(box.y, "back at the top of the viewport").toBeLessThan(4);

  // A menu opening while parked brings the header back rather than opening
  // a panel hanging off a header nobody can see.
  await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" as ScrollBehavior }));
  await expect(header).toHaveClass(/\bhide\b/);
  await page.locator(".mega-top", { hasText: "Our Products" }).hover();
  await expect(header).not.toHaveClass(/\bhide\b/);
});

test("OmniRoad is gone from the site, and its old address redirects", async ({ page, request }) => {
  const res = await request.get("/our-products/omni-road", { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers()["location"]).toContain("/our-products");

  await page.goto("/our-products");
  await expect(page.locator(".card.prod")).toHaveCount(4);
  for (const path of ["/", "/our-products", "/who-we-are/about-develmo"]) {
    await page.goto(path);
    await quiet(page);
    expect(await page.locator("body").innerText(), path).not.toContain("OmniRoad");
  }
});
