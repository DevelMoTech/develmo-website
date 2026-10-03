#!/usr/bin/env node
// Pushes the typed product list into content_entries, which is what the site
// actually renders.
//
// src/lib/products.ts is only the fallback: once any product row exists, the
// database wins. So a product added or rewritten in code stays invisible
// until this runs, and the content console has no way to add or delete a
// whole entry.
//
//   npm run content:sync-products -- --dry-run   show what would change
//   npm run content:sync-products               insert missing, fix the order
//   npm run content:sync-products -- --overwrite  also replace edited rows
//
// Without --overwrite an existing row is left exactly as it is, because it
// may carry edits made in the console. The dry run names every row that
// differs so you can decide.

import { existsSync } from "node:fs";
import { Pool } from "pg";
import { products } from "../src/lib/products.ts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const dryRun = process.argv.includes("--dry-run");
const overwrite = process.argv.includes("--overwrite");
if (!process.env.DATABASE_URL) {
  console.log("[!!] DATABASE_URL is not set.");
  process.exit(1);
}

// jsonb does not keep the key order it was given, so a plain stringify of a
// row never matches the file and every product would look edited. Compare on
// a canonical form instead: keys sorted, all the way down.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let changed = 0;

try {
  console.log(`[..] ${dryRun ? "checking" : "updating"} ${new URL(process.env.DATABASE_URL).host}`);
  const existing = new Map(
    (await pool.query("select key, data, sort_order from content_entries where entity = 'product'")).rows.map((r) => [r.key, r]),
  );

  for (const [i, product] of products.entries()) {
    const row = existing.get(product.slug);
    const wanted = JSON.stringify(product);
    if (!row) {
      changed += 1;
      console.log(`${dryRun ? "[--] would add" : "[ok] added"} ${product.slug} at position ${i}`);
      if (!dryRun) {
        await pool.query("insert into content_entries (entity, key, data, sort_order) values ('product', $1, $2::jsonb, $3)", [product.slug, wanted, i]);
      }
      continue;
    }
    const sameData = canonical(row.data) === canonical(product);
    const sameOrder = row.sort_order === i;
    if (sameData && sameOrder) continue;
    if (!sameData && !overwrite) {
      console.log(`[..] ${product.slug} differs from the typed file; run with --overwrite to replace it`);
      if (!sameOrder) {
        changed += 1;
        console.log(`${dryRun ? "[--] would move" : "[ok] moved"} ${product.slug} to position ${i}`);
        if (!dryRun) await pool.query("update content_entries set sort_order = $1 where entity = 'product' and key = $2", [i, product.slug]);
      }
      continue;
    }
    changed += 1;
    console.log(`${dryRun ? "[--] would update" : "[ok] updated"} ${product.slug}${sameOrder ? "" : ` and moved it to position ${i}`}`);
    if (!dryRun) {
      await pool.query("update content_entries set data = $1::jsonb, sort_order = $2, updated_at = now() where entity = 'product' and key = $3", [wanted, i, product.slug]);
    }
  }

  const known = new Set(products.map((p) => p.slug));
  for (const key of existing.keys()) {
    if (!known.has(key)) console.log(`[!!] ${key} is in the database but not in the typed file. Nothing here deletes it; check whether it should still be on the site`);
  }

  if (changed === 0) console.log("[ok] the database already matches the typed product list");
  else if (!dryRun) {
    console.log("");
    console.log("[..] The site serves products from a cache that survives a restart.");
    console.log("     Clear it at /admin/performance/cache so the change shows.");
  }
} catch (err) {
  console.log(`[!!] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
