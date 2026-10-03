#!/usr/bin/env node
// Finds English that survived a change of language.
//
// Grepping the source for tr("...") only finds the literal calls. Page content
// held in a const array and rendered as {tr(f)}, or English handed to PageHero
// and CtaBand as a prop, never matches that grep, and t() falls back to English
// without complaining. The page looks finished and ships half translated.
//
// So this does not read the source at all. It fetches each page twice, once in
// English and once in another language, and keeps every text segment that comes
// back byte identical. Anything that survives a change of language never
// reached the dictionary.
//
//   npm run i18n:leaks                       the four product pages, in ar
//   npm run i18n:leaks -- jobs our-blogs      other routes
//   BASE=http://localhost:3010 LOCALE=fr npm run i18n:leaks
//
// Routes are given without the leading slash: Git Bash on Windows rewrites a
// leading slash into a path and the route arrives as C:/Program Files/Git/...
// A leading slash is accepted too, for every other shell.
//
// A handful of segments are English on purpose and are always ignored: product
// and vendor names, file formats, the language switcher endonyms, and the
// decorative mono labels the brand rules keep in English.
//
// Run it against ar. French and Spanish share plenty of words with English
// (FAQ, LOCAL, Agent, Index), so an fr pass reports things that are correct,
// while anything still in Latin script on the Arabic page is a real gap.

const BASE = process.env.BASE || "http://localhost:3010";
const LOCALE = process.env.LOCALE || "ar";
const DEFAULT_ROUTES = [
  "/our-products/crowdiq",
  "/our-products/padeliq",
  "/our-products/develmo-gpt",
  "/our-products/ai-voice-agent",
];

const routes = process.argv.slice(2).map((a) => (a.startsWith("/") ? a : `/${a}`));
for (const r of routes) {
  if (/^\/[A-Za-z]:/.test(r)) {
    console.log(`[!!] ${r} looks like a Windows path, not a route. Drop the leading slash: npm run i18n:leaks -- jobs`);
    process.exit(1);
  }
}
const ROUTES = routes.length ? routes : DEFAULT_ROUTES;

// English everywhere by design.
const KEEP = new Set([
  "DevelMo", "DevelMo.", "DevelMoGPT", "CrowdIQ", "PadelIQ", "AI Voice Agent", "OmniRoad",
  "ElevenLabs", "FAISS", "NVIDIA", "Next.js and React", "Python", "Ubuntu, Windows or macOS",
  "CRM", "API", "APIs", "GPU", "RAM", "PDF", "CSV", "RPF",
  "English", "Español", "Français", "العربية", "اردو",
  "info@develmo.com", "Pakistan", "E-commerce", "Startups", "Contact", "Skip to content",
  // The advisory board members. A person's name is not translated, and the
  // monograms beside them are their initials.
  "Ali Murtaza", "Muhammad Rashid Anwar", "AM", "MRA",
  "JSON", "DOCX", "XLSX", "PPTX", "TXT", "PDF, DOCX, XLSX, CSV, PPTX, TXT",
  "10 m × 20 m", "P1 to P4",
  "// FEATURED", "// LET'S BUILD", "// GLOBAL PRESENCE", "// BUILT IN-HOUSE · NO TEMPLATES",
  "GLOBAL DELIVERY · LHR / SYD / RUH / KHI",
]);

function segments(html) {
  const body = html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const out = [];
  for (const raw of body.split(/<[^>]+>/)) {
    const s = raw
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (s) out.push(s);
  }
  return out;
}

async function render(route, locale) {
  const res = await fetch(BASE + route, { headers: { cookie: `locale=${locale}` } });
  if (!res.ok) throw new Error(`${route} returned ${res.status}`);
  return await res.text();
}

let total = 0;
try {
  console.log(`[..] ${BASE}, English against ${LOCALE}`);
  for (const route of ROUTES) {
    const [en, other] = await Promise.all([render(route, "en"), render(route, LOCALE)]);

    // The shell has to switch too, or the page is only half in the language.
    const wantRtl = LOCALE === "ar" || LOCALE === "ur";
    const isRtl = /<html[^>]*\bdir="rtl"/i.test(other);
    const lang = (other.match(/<html[^>]*\blang="([a-z-]+)"/i) || [])[1];
    if (lang !== LOCALE || isRtl !== wantRtl) {
      total += 1;
      console.log(`[!!] ${route}: lang=${lang} dir=${isRtl ? "rtl" : "ltr"}, expected lang=${LOCALE} dir=${wantRtl ? "rtl" : "ltr"}`);
    }

    const otherSet = new Set(segments(other));
    // [A-Za-z], not [a-z]: an uppercase pill like MATCH and a short label like
    // Ask are exactly the ones that slip through a review, and both were real.
    const bare = (s) => s.replace(/^[\s·|,-]+|[\s·|,-]+$/g, "");
    const leaks = [...new Set(segments(en))].filter(
      (s) => otherSet.has(s) && !KEEP.has(s) && !KEEP.has(bare(s)) && /[A-Za-z]{3}/.test(s),
    );
    total += leaks.length;
    if (leaks.length) {
      console.log(`[!!] ${route}: ${leaks.length} segment(s) unchanged by the language switch`);
      for (const l of leaks.slice(0, 12)) console.log(`       ${JSON.stringify(l.length > 100 ? `${l.slice(0, 100)}...` : l)}`);
      if (leaks.length > 12) console.log(`       and ${leaks.length - 12} more`);
    } else {
      console.log(`[ok] ${route}`);
    }
  }
  console.log(total ? `\n[!!] ${total} problem(s)` : "\n[ok] no English survived the language switch");
} catch (err) {
  console.log(`[!!] ${err instanceof Error ? err.message : String(err)}`);
  console.log("     Is the site running? Start it with: npx next start -p 3010");
  process.exitCode = 1;
}
if (total) process.exitCode = 1;
