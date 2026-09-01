// Regenerates public/og.jpg — the Open Graph / Twitter card image.
//
// Why this exists: chat clients do not all render a 1.91:1 card. WhatsApp (and
// iMessage/Slack compact rows) draw the preview as a SQUARE tile and centre-crop
// the image to fill it, so anything outside the centred 630x630 region is cut
// off. The layout below therefore keeps every element inside a 600px-wide
// centred column ("safe square") while the artwork itself stays full-bleed
// 1200x630 — square crops lose nothing, wide cards show the whole thing, and
// neither gets letterbox bars.
//
// Run with: npm run og
//
// Fonts are the same Raleway / Hanken Grotesk latin variable files next/font
// serves to the site, vendored under scripts/fonts/ so this stays deterministic
// and offline.

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "og.jpg");

const WIDTH = 1200;
const HEIGHT = 630;
// WhatsApp's square tile keeps the centre HEIGHT x HEIGHT box; leave a margin.
const SAFE = 600;

const font = (file) =>
  `data:font/woff2;base64,${readFileSync(join(here, "fonts", file)).toString("base64")}`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face{font-family:Raleway;src:url("${font("raleway-latin-var.woff2")}") format("woff2");font-weight:100 900;font-style:normal}
  @font-face{font-family:"Hanken Grotesk";src:url("${font("hanken-grotesk-latin-var.woff2")}") format("woff2");font-weight:100 900;font-style:normal}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  .card{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#021c26;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        overflow:hidden}
  /* Full-bleed depth: a centred glow so the square crop is composed too. */
  .card::before{content:"";position:absolute;inset:0;
    background:
      radial-gradient(680px 520px at 50% 42%, rgba(15,178,242,.16), transparent 70%),
      radial-gradient(900px 700px at 50% 118%, rgba(61,242,224,.10), transparent 68%),
      linear-gradient(160deg,#03293f 0%,#021c26 55%,#021017 100%)}
  .bar{position:absolute;top:0;left:0;right:0;height:6px;
       background:linear-gradient(90deg,#0fb2f2,#3df2e0)}
  .safe{position:relative;width:${SAFE}px;text-align:center}
  .mark{font-family:Raleway,sans-serif;font-weight:900;font-size:118px;line-height:1;
        letter-spacing:-.025em;color:#fff;white-space:nowrap}
  .dot{display:inline-block;width:20px;height:20px;border-radius:50%;
       background:#0fb2f2;margin-left:16px;vertical-align:baseline}
  .rule{width:120px;height:5px;border-radius:3px;background:#3df2e0;margin:30px auto 26px}
  .tag{font-family:Raleway,sans-serif;font-weight:800;font-size:40px;line-height:1.1;
       letter-spacing:-.01em;color:#0fb2f2;white-space:nowrap}
  .sub{font-family:"Hanken Grotesk",sans-serif;font-weight:400;font-size:21px;
       line-height:1.4;color:#9AA6C2;margin-top:16px;white-space:nowrap}
  .domain{position:absolute;left:0;right:0;bottom:44px;text-align:center;
          font-family:"Hanken Grotesk",sans-serif;font-weight:700;font-size:19px;
          letter-spacing:.03em;color:#3df2e0}
</style></head>
<body>
  <div class="card">
    <div class="bar"></div>
    <div class="safe">
      <div class="mark" id="mark">DevelMo<span class="dot"></span></div>
      <div class="rule"></div>
      <div class="tag" id="tag">AI that fits your business</div>
      <div class="sub" id="sub">AI, computer vision, cloud and custom software</div>
    </div>
    <div class="domain" id="domain">develmo.com</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2, // supersample, then screenshot back down to CSS pixels
});
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

// Guard the whole point of this layout: nothing may exceed the safe square.
const widths = await page.evaluate(() =>
  ["mark", "tag", "sub", "domain"].map((id) => {
    // Every element here is a full-width centred block, so measure the inked
    // text run rather than the box it sits in.
    const range = document.createRange();
    range.selectNodeContents(document.getElementById(id));
    return [id, Math.ceil(range.getBoundingClientRect().width)];
  }),
);
const overflow = widths.filter(([, w]) => w > SAFE);
for (const [id, w] of widths) console.log(`  ${id.padEnd(7)} ${w}px`);
if (overflow.length) {
  await browser.close();
  throw new Error(
    `Content exceeds the ${SAFE}px safe square and would be cropped by WhatsApp: ` +
      overflow.map(([id, w]) => `${id}=${w}px`).join(", "),
  );
}

const jpeg = await page.screenshot({ type: "jpeg", quality: 92, scale: "css" });
writeFileSync(OUT, jpeg);
await browser.close();
console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT}, ${(jpeg.length / 1024).toFixed(0)} KB)`);
