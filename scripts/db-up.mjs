// Starts the local Postgres this project develops against, and says what it
// did. The portable server on this machine stops after every reboot, and a
// stopped database shows up as a sign-in that fails, a page that falls back
// to file data, or a "Failed query" in the dev overlay. One command beats a
// diagnosis.
//
//   npm run db:up
//
// Reads the host and port from DATABASE_URL in .env.local. The server binary
// and data directory default to this machine's layout and can be overridden
// with PG_BIN (the directory holding pg_ctl) and PG_DATA.
//
// "Up" means it answers a query. An open port is not enough: a server in
// crash recovery or in the middle of shutting down accepts the connection and
// then refuses the query, and this script must never say "ok" to that.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const host = url?.hostname || "localhost";
const port = Number(url?.port || 5432);
const bin = process.env.PG_BIN || "D:/Work/Develmo/devtools/pgsql/bin";
const data = process.env.PG_DATA || "D:/Work/Develmo/devtools/pgdata";
const pgCtl = path.join(bin, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
const logFile = path.join(data, "pg.log");
const where = `${host}:${port}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listening() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: host === "localhost" ? "127.0.0.1" : host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

// The only test that counts.
async function answers() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000 });
  const t0 = Date.now();
  try {
    await pool.query("select 1");
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Polls until the server answers, giving a server in recovery time to finish.
async function waitUntilAnswers(seconds) {
  let last = "";
  for (let i = 0; i < seconds * 2; i++) {
    if (await listening()) {
      const a = await answers();
      if (a.ok) return a;
      last = a.reason;
      if (/shutting down/i.test(last)) return { ok: false, reason: last, shuttingDown: true };
    }
    await sleep(500);
  }
  return { ok: false, reason: last || "the port never opened" };
}

async function waitUntilClosed(seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (!(await listening())) return true;
    await sleep(500);
  }
  return false;
}

function tailLog() {
  try {
    const lines = readFileSync(logFile, "utf8").trim().split(/\r?\n/);
    return lines.slice(-12).map((l) => `      ${l}`).join("\n");
  } catch {
    return `      (no log at ${logFile})`;
  }
}

function fail(message) {
  console.log(`[!!] ${message}`);
  console.log(`      last lines of ${logFile}:`);
  console.log(tailLog());
  process.exit(1);
}

if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.log(`[ok] DATABASE_URL points at ${host}, which is not a local server. Nothing to start.`);
  process.exit(0);
}

if (await listening()) {
  const first = await answers();
  if (first.ok) {
    console.log(`[ok] postgres is already running on ${where}, answered select 1 in ${first.ms}ms`);
    process.exit(0);
  }
  if (/shutting down/i.test(first.reason)) {
    console.log(`[..] postgres on ${where} is shutting down, waiting for it to finish before starting it again`);
    if (!(await waitUntilClosed(30))) fail(`postgres on ${where} is still shutting down after 30s`);
  } else {
    console.log(`[..] postgres on ${where} is listening but not answering yet: ${first.reason}`);
    const later = await waitUntilAnswers(30);
    if (later.ok) {
      console.log(`[ok] postgres on ${where} is answering now, select 1 in ${later.ms}ms`);
      process.exit(0);
    }
    if (later.shuttingDown) {
      console.log(`[..] postgres on ${where} is shutting down, waiting for it to finish before starting it again`);
      if (!(await waitUntilClosed(30))) fail(`postgres on ${where} is still shutting down after 30s`);
    } else {
      fail(`postgres on ${where} is listening but did not answer within 30s: ${later.reason}`);
    }
  }
}

if (!existsSync(pgCtl)) {
  console.log(`[!!] postgres is not running on ${where}, and there is no server to start at ${pgCtl}`);
  console.log(`     Set PG_BIN to the directory holding pg_ctl and PG_DATA to the data directory, in .env.local.`);
  process.exit(1);
}
if (!existsSync(path.join(data, "PG_VERSION"))) {
  console.log(`[!!] ${data} is not a Postgres data directory (no PG_VERSION). Set PG_DATA in .env.local.`);
  process.exit(1);
}

console.log(`[..] postgres is not running on ${where}, starting it from ${bin}`);
// Not spawnSync with piped output: on Windows the server pg_ctl launches
// inherits those pipes and holds them open, so the call never returns even
// though the server is up. Detach, ignore stdio, and judge by a real query
// and the server's own log instead.
const child = spawn(pgCtl, ["-D", data, "-l", logFile, "-o", `-p ${port}`, "start"], { detached: true, stdio: "ignore", windowsHide: true });
child.on("error", (err) => console.log(`      pg_ctl could not be run: ${err.message}`));
child.unref();

const result = await waitUntilAnswers(45);
if (result.ok) {
  console.log(`[ok] postgres started on ${where}, answered select 1 in ${result.ms}ms`);
  process.exit(0);
}
fail(`postgres did not answer on ${where} within 45s: ${result.reason}`);
