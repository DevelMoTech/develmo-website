#!/usr/bin/env node
// One-shot: takes OmniRoad 2.0 out of the content the database holds.
//
// The code no longer ships the product, but content_entries is what the site
// actually renders, and nothing prunes a row when the code stops shipping it.
// This removes the product row and rewrites the four About sentences that
// name the product. Safe to run twice: it reports "already clean" and writes
// nothing the second time.
//
//   node scripts/retire-omniroad.mjs            against .env.local
//   node scripts/retire-omniroad.mjs --dry-run  show what it would change
//   DATABASE_URL=... node scripts/retire-omniroad.mjs   against production
//
// The site also filters the slug in src/lib/repo/products.ts, so the product
// is already invisible; this is the tidy-up behind that.

import { existsSync } from "node:fs";
import { Pool } from "pg";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const dryRun = process.argv.includes("--dry-run");
if (!process.env.DATABASE_URL) {
  console.log("[!!] DATABASE_URL is not set.");
  process.exit(1);
}

// The same edits the typed files carry, so the database and the fallback say
// the same thing.
const REWRITES = [
  [
    "We also build our own products. CrowdIQ, OmniRoad 2.0, and PadelIQ are where we prove",
    "We also build our own products. CrowdIQ and PadelIQ are where we prove",
  ],
  [
    "Products like CrowdIQ, OmniRoad 2.0, and PadelIQ show we build",
    "Products like CrowdIQ and PadelIQ show we build",
  ],
  [
    "OmniRoad 2.0 and PadelIQ extend that vision expertise into new domains, proving the same engineering can move from the shop floor to the road to the sports court.",
    "PadelIQ extends that vision expertise into a new domain, proving the same engineering can move from the shop floor to the sports court.",
  ],
  [
    "Our work on CrowdIQ, OmniRoad 2.0, and PadelIQ means the same teams",
    "Our work on CrowdIQ and PadelIQ means the same teams",
  ],
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

try {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`[..] ${dryRun ? "checking" : "updating"} ${host}`);

  const product = await pool.query("select key from content_entries where entity = 'product' and key = 'omni-road'");
  if (product.rowCount === 0) console.log("[ok] no omni-road product row");
  else if (dryRun) console.log("[--] would delete the omni-road product row");
  else {
    await pool.query("delete from content_entries where entity = 'product' and key = 'omni-road'");
    console.log("[ok] deleted the omni-road product row");
  }

  const rows = await pool.query("select id, key, data::text as text from content_entries where entity = 'about'");
  let touched = 0;
  for (const row of rows.rows) {
    let next = row.text;
    const applied = [];
    for (const [from, to] of REWRITES) {
      if (!next.includes(from)) continue;
      next = next.split(from).join(to);
      applied.push(from.slice(0, 48));
    }
    if (applied.length === 0) continue;
    touched += 1;
    console.log(`${dryRun ? "[--] would rewrite" : "[ok] rewrote"} about/${row.key}: ${applied.length} sentence(s)`);
    if (!dryRun) await pool.query("update content_entries set data = $1::jsonb, updated_at = now() where id = $2", [next, row.id]);
  }
  if (touched === 0) console.log("[ok] the About content is already clean");

  const left = await pool.query("select entity, key from content_entries where data::text like '%OmniRoad%'");
  if (left.rowCount === 0) console.log("[ok] nothing in content_entries mentions OmniRoad");
  else console.log(`[!!] still mentioned in: ${left.rows.map((r) => `${r.entity}/${r.key}`).join(", ")}`);

  const posts = await pool.query("select slug from posts where title ilike '%omniroad%' or body_md ilike '%omniroad%'");
  if (posts.rowCount > 0) console.log(`[!!] posts mentioning OmniRoad, edit or retire these by hand: ${posts.rows.map((r) => r.slug).join(", ")}`);
  else console.log("[ok] no post mentions OmniRoad");

  if (!dryRun && touched > 0) {
    console.log("");
    console.log("[..] The site serves this content from a cache that survives a restart.");
    console.log("     Clear it at /admin/performance/cache, or the old wording keeps showing.");
  }
} catch (err) {
  console.log(`[!!] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
