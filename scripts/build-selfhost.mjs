#!/usr/bin/env node
// Builds a self-contained bundle for a plain Node host (a Hostinger VPS or
// Cloud plan, or any server that can run `node`), as opposed to Vercel, which
// builds its own.
//
//   npm run build:selfhost
//
// What it produces, in ./deploy:
//   server.js          the Next server, started with `node server.js`
//   .next/             the compiled app, including .next/static
//   public/            the hand placed assets
//   node_modules/      only the packages the app actually reaches
//   package.json       so the host knows the start command
//
// Next writes .next/standalone WITHOUT .next/static or public, by design: on a
// CDN those are served separately. On a single server nothing else serves them,
// so the site would come up with no CSS, no fonts and no images. This copies
// them in, which is the step that is usually missed.
//
// What it deliberately does not do: copy .env.local. Secrets belong in the
// host's own environment panel, not in a bundle that gets uploaded.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIST = process.env.NEXT_DIST_DIR ?? ".next";
const OUT = resolve(ROOT, "deploy");

function die(message, hint) {
  console.log(`[!!] ${message}`);
  if (hint) console.log(`     ${hint}`);
  process.exit(1);
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += sizeOf(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log("[..] building for a self-hosted Node server");

// The build has to know it is making a standalone bundle, and the postbuild
// stats script reads the same dist directory.
// Next's own CLI entry point rather than npx: no shell, so nothing here
// depends on how the host quotes arguments.
const build = spawnSync(process.execPath, [resolve(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_STANDALONE: "1" },
});
if (build.status !== 0) die("the build failed; nothing was assembled");

const standalone = resolve(ROOT, DIST, "standalone");
if (!existsSync(standalone)) {
  die(
    `${DIST}/standalone is missing after the build`,
    "next.config.ts only sets output: standalone when NEXT_STANDALONE is set, which this script does.",
  );
}

console.log("[..] assembling ./deploy");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// The standalone tree already holds server.js, a trimmed node_modules and the
// server half of .next.
cpSync(standalone, OUT, { recursive: true });

// The two trees Next leaves out, which nothing else will serve here.
const staticDir = resolve(ROOT, DIST, "static");
if (!existsSync(staticDir)) die(`${DIST}/static is missing`);
cpSync(staticDir, join(OUT, DIST, "static"), { recursive: true });
cpSync(resolve(ROOT, "public"), join(OUT, "public"), { recursive: true });

// A dist directory other than .next changes where server.js looks; say so
// rather than shipping a bundle that half works.
if (DIST !== ".next") {
  console.log(`[!!] built with NEXT_DIST_DIR=${DIST}. Run this without NEXT_DIST_DIR set for a deploy bundle.`);
}

// Secrets must never travel in the bundle.
for (const leaked of [".env", ".env.local", ".env.production"]) {
  const p = join(OUT, leaked);
  if (existsSync(p)) {
    rmSync(p);
    console.log(`[ok] removed ${leaked} from the bundle; set those values on the host instead`);
  }
}

// Neither must anyone's uploads. next.config.ts tells the tracer to skip
// ./.data, but this is the check that matters, because what is in there is
// applicants' CVs: if the exclude ever stops working, the bundle must still
// go out without them rather than quietly carrying them to a new host.
const uploads = join(OUT, ".data");
if (existsSync(uploads)) {
  const n = sizeOf(uploads);
  rmSync(uploads, { recursive: true, force: true });
  console.log(`[ok] removed .data (${mb(n)}) from the bundle: uploads are runtime state, not build output`);
}

// And the last bundle, which the tracer would otherwise fold into this one,
// growing it on every build.
const nested = join(OUT, "deploy");
if (existsSync(nested)) {
  rmSync(nested, { recursive: true, force: true });
  console.log("[ok] removed the previous bundle from inside this one");
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
writeFileSync(
  join(OUT, "package.json"),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      // Next writes server.js in whichever module system the project uses, so
      // this has to mirror the root package.json rather than assume one: with
      // "type": "module" there, server.js uses import and a commonjs entry
      // here makes it die on its first line. Everything under .next is
      // CommonJS either way, and Next guards that with its own package.json.
      type: pkg.type ?? "commonjs",
      // The standalone server is already bundled: there is nothing to install
      // on the host, and `npm install` here would undo the trimming.
      scripts: { start: "node server.js" },
      engines: { node: ">=20.9" },
    },
    null,
    2,
  )}\n`,
);

const required = [
  ["DATABASE_URL", "Postgres. The console, the content, the submissions and the sessions all read it"],
  ["AUTH_SECRET", "signs the admin session cookies"],
  ["NEXT_PUBLIC_SITE_URL", "the public origin, used for canonicals and the sitemap"],
];
const recommended = [
  ["SMTP_HOST / SMTP_USER / SMTP_PASS", "contact form and console email"],
  ["NEXT_PUBLIC_RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY", "without these the contact form check is off"],
  ["UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN", "durable rate limiting; falls back to the database"],
];

console.log("");
console.log(`[ok] ./deploy is ready (${mb(sizeOf(OUT))})`);
console.log("");
console.log("     Upload the whole ./deploy directory, then start it with:");
console.log("       node server.js");
console.log("     It listens on $PORT (3000 if unset) and $HOSTNAME (0.0.0.0 is usual behind a proxy).");
console.log("");
console.log("     Set these on the host, not in the bundle:");
for (const [k, why] of required) console.log(`       ${k}  ${why}`);
console.log("     Recommended:");
for (const [k, why] of recommended) console.log(`       ${k}  ${why}`);
console.log("");
console.log("     Before you test on a temporary host name or an IP: the reCAPTCHA site key is registered");
console.log("     for develmo.com, www.develmo.com and localhost only. On any other host every contact");
console.log("     submission is rejected with 'reCAPTCHA rejected (browser-error)' and the visitor sees");
console.log("     nothing. Add the host in the Google reCAPTCHA admin console, or leave the keys unset there.");
console.log("");
console.log("     Two things Vercel did that a plain server does not:");
console.log("       - Scheduled posts: Vercel Cron called /api/cron/publish. Add a real cron job for it.");
console.log("       - Uploads: with BLOB_READ_WRITE_TOKEN unset, media and CVs are written to ./.data/media");
console.log("         next to the server. That works on a VPS with a persistent disk. Back it up, and keep it");
console.log("         out of the directory you overwrite on the next deploy.");
