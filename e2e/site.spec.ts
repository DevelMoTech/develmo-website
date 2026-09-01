import { test, expect, type ConsoleMessage } from "@playwright/test";

const routes = [
  "/",
  "/what-we-do",
  "/what-we-do/web-and-mobile-app-development",
  "/what-we-do/generative-ai-llm-integration",
  "/what-we-do/computer-vision-image-recognition",
  "/what-we-do/cloud-strategy-infrastructure",
  "/who-we-help",
  "/who-we-help/healthcare-pharmaceuticals",
  "/who-we-help/banking-and-fintech",
  "/our-products",
  "/our-products/crowdiq",
  "/our-products/omni-road",
  "/our-products/padeliq",
  "/who-we-are",
  "/who-we-are/about-develmo",
  "/our-knowledge-base",
  "/our-blogs",
  "/our-blogs/turn-cameras-into-measurable-insight",
  "/jobs",
  "/contact-develmo",
  "/privacy",
  "/terms",
  "/cookies",
];

const IGNORE = [
  /favicon/i,
  /react devtools/i,
  /Fast Refresh/i,
  /ERR_ABORTED/i, // hero-video request aborted under parallel load (automation artifact, not a bug)
  /\.mp4/i,
];

function collectErrors(page: import("@playwright/test").Page, bucket: string[]) {
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) bucket.push(m.text());
  });
  page.on("pageerror", (e) => bucket.push(String(e)));
}

for (const route of routes) {
  test(`loads cleanly: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    collectErrors(page, errors);
    const resp = await page.goto(route, { waitUntil: "networkidle" });
    expect(resp?.status(), `HTTP status for ${route}`).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors, `console errors on ${route}`).toEqual([]);
  });
}

test("404 page renders for unknown route", async ({ page }) => {
  const resp = await page.goto("/this-page-does-not-exist");
  expect(resp?.status()).toBe(404);
  await expect(page.getByText("Error 404")).toBeVisible();
});

test("primary nav links navigate", async ({ page }) => {
  const links: [string, RegExp][] = [
    ["What We Do", /\/what-we-do$/],
    ["Who We Help", /\/who-we-help$/],
    ["Our Products", /\/our-products$/],
    ["Who We Are", /\/who-we-are$/],
    ["Insights", /\/our-blogs$/],
  ];
  for (const [label, urlRe] of links) {
    await page.goto("/");
    await page.locator("a.mega-toplink", { hasText: label }).first().click();
    await expect(page).toHaveURL(urlRe);
  }
});

test("hero consultation CTA goes to contact", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Book a Free Consultation" }).first().click();
  await expect(page).toHaveURL(/\/contact-develmo$/);
});

test("all internal links from home resolve", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.$$eval("a[href^='/']", (as) =>
    Array.from(new Set(as.map((a) => a.getAttribute("href")).filter((h): h is string => !!h))),
  );
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), `link ${href}`).toBeLessThan(400);
  }
});

/* ---------- responsiveness + mega-nav behaviour (HANDOFF 9.1) ---------- */

const RESPONSIVE_ROUTES = [
  "/",
  "/what-we-do",
  "/who-we-help",
  "/our-products",
  "/our-products/crowdiq",
  "/contact-develmo",
  "/who-we-are",
  "/our-blogs",
];

// Widths that previously broke: 360 (footer social row held the grid open),
// 1280 (header nav + both CTAs overflowed the viewport).
for (const width of [320, 360, 375, 414, 768, 1024, 1280, 1440, 1920]) {
  test(`no horizontal overflow @${width}px`, async ({ page }) => {
    // Walks every route in one test, so it needs more than the 30s default
    // when the suite runs fully parallel.
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of RESPONSIVE_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${route} @${width}px scrolls sideways`).toBeLessThanOrEqual(clientWidth + 1);
    }
  });
}

test("no horizontal overflow in RTL (ar) @375px", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addCookies([
    { name: "locale", value: "ar", url: process.env.E2E_BASE_URL || "http://localhost:3007" },
  ]);
  await page.setViewportSize({ width: 375, height: 900 });
  for (const route of RESPONSIVE_ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${route} @375px RTL scrolls sideways`).toBeLessThanOrEqual(clientWidth + 1);
  }
});

/* Text/background contrast. Catches the class of bug where a broad selector
   out-specifies a component's own colour, e.g. `.footer a` beating `.btn-teal`
   and rendering the pre-footer CTA label invisible on its own background. */
const CONTRAST_PROBE = `() => {
  const out = [];
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1 }; };
  const lum = (c) => { const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const flatten = (fg,bg) => ({ r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a), b:fg.b*fg.a+bg.b*(1-fg.a), a:1 });
  // Returns null when the text sits on a background IMAGE (photo cards): the
  // real backdrop is unknowable from computed style, so skip rather than guess.
  const effBg = (el) => { let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage.indexOf('url(') !== -1) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.85) return c;
      n = n.parentElement;
    }
    return { r:255, g:255, b:255, a:1 }; };
  document.querySelectorAll('a,button,p,h1,h2,h3,h4,h5,li,span,small,label,summary').forEach((el) => {
    const txt = (el.textContent || '').trim();
    if (!txt || txt.length > 120) return;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return;
    const fg = parse(cs.color); if (!fg) return;
    const bg = effBg(el); if (!bg) return;
    const l1 = lum(fg.a < 1 ? flatten(fg,bg) : fg), l2 = lum(bg);
    const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const size = parseFloat(cs.fontSize);
    const need = (size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700)) ? 3 : 4.5;
    if (ratio < need) out.push(Math.round(ratio*100)/100 + ':1 (need ' + need + ') <' + el.tagName +
      ' class="' + (el.className||'').toString().slice(0,44) + '"> "' + txt.slice(0,34) + '" color=' + cs.color);
  });
  return out;
}`;

for (const theme of ["light", "dark"] as const) {
  test(`text contrast meets AA (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    // Seed localStorage before navigation so layout.tsx's no-flash script picks
    // the theme up at parse time. Setting data-theme after load races with it.
    await page.addInitScript((t) => {
      try { localStorage.setItem("theme", t as string); } catch {}
    }, theme);
    const found = new Set<string>();
    const routes = [
      ...RESPONSIVE_ROUTES,
      "/what-we-do/computer-vision-image-recognition",
      "/who-we-help/healthcare-pharmaceuticals",
      "/our-products/omni-road",
      "/who-we-are/about-develmo",
      "/our-knowledge-base",
      "/jobs",
      "/case-studies",
      "/our-blogs/turn-cameras-into-measurable-insight",
      "/privacy",
    ];
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const f of (await page.evaluate(`(${CONTRAST_PROBE})()`)) as string[]) found.add(f);
    }
    expect([...found], `low-contrast text in ${theme} mode`).toEqual([]);
  });
}

test("home hero keeps a side gutter on mobile", async ({ page }) => {
  // .hero-in used shorthand `padding`, which wiped .container's horizontal
  // gutter and pinned the headline to the screen edge at phone widths.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const sel of ["h1", ".hero-cta .btn", ".hero-stats"]) {
    const left = await page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().left);
    expect(left, `${sel} is flush against the viewport edge`).toBeGreaterThanOrEqual(16);
  }
});

test("mega panel closes when a panel item is clicked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator("a.mega-toplink", { hasText: "Who We Help" }).first().hover();
  const panel = page.locator(".mega-top.open .mega-panel");
  await expect(panel).toBeVisible();
  await panel.locator("a.mega-prod").first().click();
  await expect(page).toHaveURL(/\/who-we-help\/.+/);
  // Every panel must be hidden: a panel left open by :focus-within covers the
  // top of the new page and swallows clicks on the hero CTAs.
  await expect(page.locator(".mega-panel:visible")).toHaveCount(0);
});

test("mega panel fits inside the viewport on a short laptop screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  for (const label of ["What We Do", "Who We Help", "Our Products", "Who We Are"]) {
    await page.locator("a.mega-toplink", { hasText: label }).first().hover();
    const panel = page.locator(".mega-top.open .mega-panel");
    await expect(panel).toBeVisible();
    const bottom = await panel.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(bottom, `${label} panel runs past the bottom of the viewport`).toBeLessThanOrEqual(700);
  }
});

test("mobile drawer opens below the header, navigates and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const hamburger = page.locator(".mega-hamb");
  // Tap target must clear 44px.
  const box = await hamburger.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);

  await hamburger.click();
  const drawer = page.locator(".mega-drawer");
  await expect(drawer).toBeVisible();
  // Drawer must start at the bottom edge of the header, never over it.
  const headerBottom = await page.locator("header.mega").evaluate((el) => el.getBoundingClientRect().bottom);
  const drawerBox = await drawer.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom };
  });
  expect(Math.abs(drawerBox.top - headerBottom)).toBeLessThanOrEqual(2);
  // The drawer must fill the rest of the screen. If an ancestor picks up a
  // backdrop-filter/transform it becomes the containing block for this
  // position:fixed element and the menu collapses to a clipped sliver.
  expect(drawerBox.bottom, "drawer does not reach the bottom of the viewport").toBeGreaterThanOrEqual(844 - 2);

  await drawer.getByRole("button", { name: "Who We Help" }).click();
  await drawer.locator("a[href^='/who-we-help/']").first().click();
  await expect(page).toHaveURL(/\/who-we-help\/.+/);
  await expect(drawer).toBeHidden();
});

test("floating CTA does not cover the footer links on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/who-we-are");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const covered = await page.evaluate(() => {
    const cta = document.querySelector<HTMLElement>(".sticky-cta");
    if (!cta) return [];
    const c = cta.getBoundingClientRect();
    return Array.from(document.querySelectorAll<HTMLElement>(".foot-bottom a, .foot-bottom"))
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.left < c.right && b.right > c.left && b.top < c.bottom && b.bottom > c.top;
      })
      .map((el) => `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 30)}`);
  });
  expect(covered, "sticky CTA overlaps footer legal links").toEqual([]);
});

test("language switcher stays available at tablet widths", async ({ page }) => {
  // 1150px shows the utility strip but uses the drawer; the switcher used to
  // be hidden by the 1200px rule while the strip around it was still visible.
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto("/");
  await expect(page.locator(".mega-util .mega-region-btn")).toBeVisible();
});

test("contact form submits successfully", async ({ page }) => {
  await page.goto("/contact-develmo");
  await page.fill("#firstName", "Test");
  await page.fill("#lastName", "User");
  await page.fill("#email", "test@example.com");
  await page.fill("#message", "This is an automated end-to-end test enquiry.");
  await page.check("input[name='consent']");
  await page.getByRole("button", { name: /book my consultation/i }).click();
  await expect(page.locator(".form-success")).toBeVisible({ timeout: 15_000 });
});
