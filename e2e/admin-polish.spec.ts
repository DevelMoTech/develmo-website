// Phase 11 polish sweep: the whole admin surface, every theme, every width in
// the §6.2 matrix. No screenshots anywhere, per HANDOFF §7; everything here is
// DOM measurement and console capture.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { cleanup } from "./helpers/admin";
import { coveredRoutes, makeFixtures, type Fixtures } from "./helpers/routes";
import { assertRoutesRender, openSweep, settled, signedInOwner, visit, waitForQuietDom, type Sweep } from "./helpers/sweep";

const WIDTHS = [360, 375, 414, 768, 1024, 1280, 1440];
const THEMES = ["develmo-light", "develmo-dark", "midnight", "slate", "high-contrast"];
const TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// Controls, not prose links. WCAG 2.5.5 exempts a link inside a sentence; a
// button, a tab or a sidebar row has no such excuse.
const CONTROL_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="menuitem"]',
  "select",
  'input[type="checkbox"]',
  'input[type="radio"]',
  "a.adm-btn",
  "a.adm-iconbtn",
  "a.adm-side-link",
  "a.adm-card-link",
].join(", ");

test.describe.configure({ mode: "serial" });

let fixtures: Fixtures | null = null;

test.beforeAll(async ({ browser, baseURL }) => {
  const owner = await signedInOwner(browser, baseURL!, "polish-setup");
  fixtures = await makeFixtures(owner.page.request, baseURL!, owner.csrf, TAG);
  await owner.context.close();
});

test.afterAll(async () => {
  await fixtures?.cleanup();
  await cleanup();
});

// ---------- 1. The inventory is complete, and every route really renders ----------

test("every page under src/app/(admin) is in the inventory and renders its own content", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const found: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") {
        const route = p
          .replace(/\\/g, "/")
          .replace(/^src\/app\/\(admin\)/, "")
          .replace(/\/page\.tsx$/, "")
          .replace(/\/\([a-z-]+\)/g, "");
        found.push(route === "" ? "/" : route);
      }
    }
  })("src/app/(admin)");

  const covered = new Set(coveredRoutes());
  const missing = found.filter((r) => !covered.has(r));
  console.log(`INVENTORY: ${found.length} admin pages on disk, ${covered.size} listed, ${missing.length} unlisted`);
  expect(missing, `these admin pages are not in the sweep inventory: ${missing.join(", ")}`).toEqual([]);

  const sweep = await openSweep(browser, baseURL!, "polish-inv", fixtures!, { width: 1280, height: 900 });
  const seen = await assertRoutesRender(sweep.targets);
  console.log(`RENDER PROOF: all ${seen.length} routes served their own page with an h1, no redirect stubs`);
  console.log(seen.slice(0, 8).join("\n"));
  await sweep.close();
});

// ---------- 2. Responsive matrix ----------

async function measure(page: Page, route: string) {
  await visit(page, route);
  return settled(page, route, async () => ({
    ...(await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }))),
    url: new URL(page.url()).pathname,
  }));
}

for (const theme of THEMES) {
  test(`no horizontal overflow on any admin route at 360 to 1440, theme ${theme}`, async ({ browser, baseURL }) => {
    test.setTimeout(1_200_000);
    const sweep: Sweep = await openSweep(browser, baseURL!, `polish-${theme}`, fixtures!, { width: 1280, height: 900 });
    await sweep.setTheme(theme);

    const bad: string[] = [];
    let checks = 0;
    for (const t of sweep.targets) {
      for (const width of WIDTHS) {
        await t.page.setViewportSize({ width, height: 900 });
        const m = await measure(t.page, t.route);
        checks += 1;
        // A one pixel rounding difference is a sub-pixel border, not overflow.
        if (m.scroll > m.client + 1 || m.body > m.client + 1) {
          bad.push(`${theme} ${width}px ${t.route}: scrollWidth=${m.scroll} bodyWidth=${m.body} clientWidth=${m.client}`);
        }
      }
    }
    console.log(`RESPONSIVE ${theme}: ${checks} route and width pairs measured, ${bad.length} overflowing`);
    expect(bad, bad.join("\n")).toEqual([]);
    await sweep.close();
  });
}

// ---------- 3. Tap targets ----------

test("every control is at least 44 by 44 CSS px at 360", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const sweep = await openSweep(browser, baseURL!, "polish-tap", fixtures!, { width: 360, height: 900 });
  await sweep.setTheme("develmo-light");

  const small: string[] = [];
  let measured = 0;
  for (const t of sweep.targets) {
    await visit(t.page, t.route);
    await waitForQuietDom(t.page);
    const results = await settled(t.page, t.route, () =>
      t.page.evaluate((sel) => {
        const out: { tag: string; label: string; w: number; h: number }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // A control wrapped in a label is tapped through the label, so the
          // label's box is the real target.
          const label = el.closest("label");
          const box = label && label.contains(el) ? label.getBoundingClientRect() : r;
          out.push({
            tag: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(/\s+/)[0]}` : ""),
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            w: Math.round(Math.max(r.width, box.width) * 10) / 10,
            h: Math.round(Math.max(r.height, box.height) * 10) / 10,
          });
        }
        return out;
      }, CONTROL_SELECTOR),
    );
    measured += results.length;
    for (const r of results) {
      if (r.w < 44 || r.h < 44) small.push(`${t.route}: <${r.tag}> "${r.label}" ${r.w}x${r.h}`);
    }
  }
  console.log(`TAP TARGETS: ${measured} controls measured at 360px across ${sweep.targets.length} routes, ${small.length} under 44x44`);
  if (small.length) console.log([...new Set(small)].slice(0, 60).join("\n"));
  expect([...new Set(small.map((s) => s.replace(/^[^:]+: /, "")))], small.slice(0, 40).join("\n")).toEqual([]);
  await sweep.close();
});

// ---------- 4. Nothing is sitting on top of a control ----------

// A control that renders but cannot be clicked is a dead control. The check is
// the browser's own hit testing: whatever is at the centre of a control must be
// that control, or something inside it.
test("no overlay or z-index swallows a click on any control", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const sweep = await openSweep(browser, baseURL!, "polish-hit", fixtures!, { width: 1280, height: 1600 });
  await sweep.setTheme("develmo-light");

  const blocked: string[] = [];
  let tested = 0;
  for (const t of sweep.targets) {
    await visit(t.page, t.route);
    await waitForQuietDom(t.page);
    const results = await settled(t.page, t.route, () =>
      t.page.evaluate((sel) => {
        const out: { tag: string; label: string; hitBy: string }[] = [];
        let checked = 0;
        // A control inside a horizontally scrolling table is clipped, not
        // covered: it is reachable once the table is scrolled. Hit test the
        // part that is actually painted, which is the element's rect
        // intersected with every scrolling ancestor and with the viewport.
        const visibleRect = (el: HTMLElement): DOMRect | null => {
          let box = el.getBoundingClientRect();
          let top = box.top;
          let left = box.left;
          let right = box.right;
          let bottom = box.bottom;
          for (let n = el.parentElement; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            const clips = /auto|scroll|hidden|clip/.test(cs.overflowX) || /auto|scroll|hidden|clip/.test(cs.overflowY);
            if (!clips) continue;
            const c = n.getBoundingClientRect();
            top = Math.max(top, c.top);
            left = Math.max(left, c.left);
            right = Math.min(right, c.right);
            bottom = Math.min(bottom, c.bottom);
          }
          top = Math.max(top, 0);
          left = Math.max(left, 0);
          right = Math.min(right, window.innerWidth);
          bottom = Math.min(bottom, window.innerHeight);
          if (right - left < 2 || bottom - top < 2) return null;
          box = new DOMRect(left, top, right - left, bottom - top);
          return box;
        };

        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue;
          const raw = el.getBoundingClientRect();
          if (raw.width === 0 || raw.height === 0) continue;
          const r = visibleRect(el);
          if (!r) continue;
          checked += 1;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && (hit === el || el.contains(hit) || hit.contains(el))) continue;
          out.push({
            tag: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(/\s+/)[0]}` : ""),
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            hitBy: hit ? hit.tagName.toLowerCase() + (hit.className ? `.${String(hit.className).split(/\s+/)[0]}` : "") : "nothing",
          });
        }
        return { out, checked };
      }, CONTROL_SELECTOR),
    );
    tested += results.checked;
    for (const r of results.out) blocked.push(`${t.route}: <${r.tag}> "${r.label}" is covered by <${r.hitBy}>`);
  }
  console.log(`HIT TESTING: ${tested} on-screen controls across ${sweep.targets.length} routes, ${blocked.length} covered by something else`);
  if (blocked.length) console.log(blocked.slice(0, 40).join("\n"));
  expect(blocked, blocked.slice(0, 25).join("\n")).toEqual([]);
  await sweep.close();
});

// ---------- 5. Console errors and React warnings ----------

const PUBLIC_ROUTES = [
  "/",
  "/what-we-do",
  "/what-we-do/computer-vision-image-recognition",
  "/who-we-help",
  "/our-products",
  "/our-blogs",
  "/who-we-are",
  "/contact-develmo",
  "/jobs",
];

// Third party noise the site does not control.
const IGNORE = [
  /recaptcha/i,
  /gstatic\.com/i,
  // Chrome resource advisory, reported rather than fixed. Next ships the root
  // not-found boundary in every response; that boundary is the public 404,
  // whose footer holds develmo-logo-white.png, so React preloads an image the
  // admin pages never show. The only fix edits the public 404 page, which
  // brief §13 rules out of this diff. Public pages do use the image, so this
  // never fires there. Listed in the handback under what was not done.
  /develmo-logo-white\.png was preloaded using link preload but not used/,
];

function capture(page: Page, sink: string[], routeRef: { route: string }) {
  page.on("console", (m: ConsoleMessage) => {
    const type = m.type();
    if (type !== "error" && type !== "warning") return;
    const text = m.text();
    if (IGNORE.some((re) => re.test(text))) return;
    sink.push(`${routeRef.route} [${type}] ${text.slice(0, 240)}`);
  });
  page.on("pageerror", (e) => sink.push(`${routeRef.route} [pageerror] ${e.message.slice(0, 240)}`));
}

test("no console errors and no React warnings on any admin route", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const sweep = await openSweep(browser, baseURL!, "polish-console", fixtures!, { width: 1280, height: 900 });
  await sweep.setTheme("develmo-light");
  const sink: string[] = [];
  const refs = new Map<Page, { route: string }>();
  for (const t of sweep.targets) {
    if (refs.has(t.page)) continue;
    const ref = { route: "" };
    refs.set(t.page, ref);
    capture(t.page, sink, ref);
  }

  for (const t of sweep.targets) {
    refs.get(t.page)!.route = t.route;
    await visit(t.page, t.route);
    // Hydration warnings arrive after load, so give React a beat to complain.
    await t.page.waitForTimeout(250);
  }
  console.log(`CONSOLE ADMIN: ${sink.length} errors or warnings across ${sweep.targets.length} routes`);
  if (sink.length) console.log(sink.slice(0, 40).join("\n"));
  expect(sink, sink.slice(0, 20).join("\n")).toEqual([]);
  await sweep.close();
});

test("no console errors and no React warnings on the public routes", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const sink: string[] = [];
  const ref = { route: "" };
  capture(page, sink, ref);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const route of PUBLIC_ROUTES) {
    ref.route = route;
    await visit(page, route);
    await page.waitForTimeout(250);
  }
  console.log(`CONSOLE PUBLIC: ${sink.length} errors or warnings across ${PUBLIC_ROUTES.length} routes`);
  if (sink.length) console.log(sink.slice(0, 40).join("\n"));
  expect(sink, sink.slice(0, 20).join("\n")).toEqual([]);
  await context.close();
});
