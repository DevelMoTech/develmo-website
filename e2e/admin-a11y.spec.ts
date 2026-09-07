// Phase 11 accessibility pass. axe-core runs inside the page against every
// admin route: the full ruleset once, then colour contrast in each of the five
// themes, because contrast is the one rule whose result depends on the theme.

import { test, expect, type Page } from "@playwright/test";
import { cleanup } from "./helpers/admin";
import { makeFixtures, type Fixtures } from "./helpers/routes";
import { assertRoutesRender, openSweep, signedInOwner, visit, waitForQuietDom } from "./helpers/sweep";

const THEMES = ["develmo-light", "develmo-dark", "midnight", "slate", "high-contrast"];
const AXE = "node_modules/axe-core/axe.min.js";
const TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

type Violation = { id: string; impact: string | null; help: string; nodes: { target: string[]; failureSummary?: string }[] };

test.describe.configure({ mode: "serial" });

let fixtures: Fixtures | null = null;

async function runAxe(page: Page, route: string, only: string[] | null): Promise<Violation[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await waitForQuietDom(page);
      await page.addScriptTag({ path: AXE });
      return await page.evaluate(async (rules) => {
        const options: Record<string, unknown> = { resultTypes: ["violations"] };
        if (rules) options.runOnly = { type: "rule", values: rules };
        const axe = (window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: Violation[] }> } }).axe;
        const res = await axe.run(document, options);
        return res.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
        }));
      }, only);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 3 || !msg.includes("Execution context was destroyed")) throw err;
      await page.waitForTimeout(400);
      await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    }
  }
  throw new Error(`axe could not run on ${route}`);
}

function format(route: string, theme: string, violations: Violation[]): string[] {
  return violations.map((v) => {
    const where = v.nodes.map((n) => n.target.join(" ")).join(" | ");
    const why = (v.nodes[0]?.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 220);
    return `${theme} ${route}: [${v.id}, ${v.impact ?? "n/a"}] ${v.help} :: ${where} :: ${why}`;
  });
}

test.beforeAll(async ({ browser, baseURL }) => {
  const owner = await signedInOwner(browser, baseURL!, "a11y-setup");
  fixtures = await makeFixtures(owner.page.request, baseURL!, owner.csrf, TAG);
  await owner.context.close();
});

test.afterAll(async () => {
  await fixtures?.cleanup();
  await cleanup();
});

test("axe full ruleset finds nothing on any admin route", async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  const sweep = await openSweep(browser, baseURL!, "a11y-full", fixtures!, { width: 1280, height: 900 });
  await sweep.setTheme("develmo-light");
  await assertRoutesRender(sweep.targets);

  const found: string[] = [];
  for (const t of sweep.targets) {
    await visit(t.page, t.route);
    found.push(...format(t.route, "develmo-light", await runAxe(t.page, t.route, null)));
  }
  console.log(`AXE FULL: ${sweep.targets.length} admin routes scanned in develmo-light, ${found.length} violations`);
  if (found.length) console.log(found.slice(0, 60).join("\n"));
  expect(found, found.slice(0, 25).join("\n")).toEqual([]);
  await sweep.close();
});

test("axe finds no contrast failure in any of the five themes", async ({ browser, baseURL }) => {
  test.setTimeout(1_800_000);
  const sweep = await openSweep(browser, baseURL!, "a11y-contrast", fixtures!, { width: 1280, height: 900 });

  const found: string[] = [];
  let scans = 0;
  for (const theme of THEMES) {
    await sweep.setTheme(theme);
    for (const t of sweep.targets) {
      await visit(t.page, t.route);
      found.push(...format(t.route, theme, await runAxe(t.page, t.route, ["color-contrast"])));
      scans += 1;
    }
  }
  console.log(`AXE CONTRAST: ${scans} route and theme pairs scanned, ${found.length} violations`);
  if (found.length) console.log(found.slice(0, 60).join("\n"));
  expect(found, found.slice(0, 25).join("\n")).toEqual([]);
  await sweep.close();
});
