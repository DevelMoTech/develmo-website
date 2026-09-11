// Starts the local Postgres this project develops against, and says what it
// did. The portable server on this machine runs as an ordinary program
// attached to whichever terminal started it, so it goes down with a reboot,
// with Ctrl+C in that terminal, or when that terminal window is closed
// (pg.log records the worker exit as 0xC000013A, Windows' control-C exit).
// A stopped database shows up as a sign-in that fails, a page that falls
// back to file data, or a "Failed query" in the dev overlay. One command
// beats a diagnosis, and "npm run dev" runs it first through the predev
// hook so the site never starts without trying.
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
//
// One more state, seen for real: the postmaster died mid-recovery and a child
// process (a background writer) outlived it. Children inherit the listening
// socket, so the port stays open while nothing answers, pg_ctl stop finds no
// server to stop, and every port check says "up". When the port is held but
// the PID in postmaster.pid is dead, this script finds postgres.exe processes
// belonging to this data directory whose parent is gone, ends them, and
// starts the server properly.

import { spawn, spawnSync } from "node:child_process";
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

// --soft: report a failure but exit 0, so "npm run dev" still starts the
// site when the database cannot be started (the site then serves the typed
// file data and the console says the database is not reachable).
const soft = process.argv.includes("--soft");
const exitFailing = () => process.exit(soft ? 0 : 1);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();

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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 2500 });
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
// Deadline based: one attempt can take a few seconds on its own.
async function waitUntilAnswers(seconds) {
  const deadline = Date.now() + seconds * 1000;
  let last = "";
  while (Date.now() < deadline) {
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
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
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
  exitFailing();
}

// The PID postmaster.pid claims, and whether that process exists.
function postmasterPid() {
  try {
    const first = readFileSync(path.join(data, "postmaster.pid"), "utf8").split(/\r?\n/)[0].trim();
    return Number(first) || null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

// Windows only: postgres.exe processes that belong to this server whose
// parent process no longer exists. Anything else is left alone.
function orphanedServerProcesses() {
  if (process.platform !== "win32") return [];
  const script = "$ErrorActionPreference='SilentlyContinue'; $pids = @(Get-Process | ForEach-Object { $_.Id }); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'postgres.exe' } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; parent = $_.ParentProcessId; parentAlive = ($pids -contains $_.ParentProcessId); cmd = [string]$_.CommandLine } } | ConvertTo-Json -Compress";
  const run = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true });
  if (run.status !== 0 || !run.stdout.trim()) return [];
  let rows;
  try {
    rows = JSON.parse(run.stdout);
  } catch {
    return [];
  }
  const list = Array.isArray(rows) ? rows : [rows];
  const binNorm = norm(bin);
  return list.filter((r) => r && !r.parentAlive && norm(r.cmd).includes(binNorm));
}

function endProcesses(pids) {
  for (const pid of pids) {
    spawnSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore", windowsHide: true });
  }
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

  const claimed = postmasterPid();
  const claimedAlive = claimed !== null && pidAlive(claimed);
  const orphans = claimedAlive ? [] : orphanedServerProcesses();

  if (orphans.length > 0) {
    console.log(`[..] the port is held by ${orphans.length} orphaned server process${orphans.length === 1 ? "" : "es"} whose postmaster (pid ${claimed ?? "unknown"}) is gone:`);
    for (const o of orphans) console.log(`      pid ${o.pid}  ${o.cmd}`);
    console.log(`      ending them so the server can start properly`);
    endProcesses(orphans.map((o) => o.pid));
    if (!(await waitUntilClosed(15))) fail(`the port on ${where} is still held after ending the orphaned processes`);
  } else if (/shutting down/i.test(first.reason)) {
    console.log(`[..] postgres on ${where} is shutting down, waiting for it to finish before starting it again`);
    if (!(await waitUntilClosed(30))) fail(`postgres on ${where} is still shutting down after 30s`);
  } else {
    console.log(`[..] postgres on ${where} is listening but not answering yet: ${first.reason}`);
    const later = await waitUntilAnswers(15);
    if (later.ok) {
      console.log(`[ok] postgres on ${where} is answering now, select 1 in ${later.ms}ms`);
      process.exit(0);
    }
    if (later.shuttingDown) {
      console.log(`[..] postgres on ${where} is shutting down, waiting for it to finish before starting it again`);
      if (!(await waitUntilClosed(30))) fail(`postgres on ${where} is still shutting down after 30s`);
    } else if (claimedAlive) {
      fail(`postgres on ${where} (pid ${claimed}) is listening but did not answer within 15s: ${later.reason}`);
    } else {
      fail(`something is holding ${where} but it is not this server: postmaster.pid says ${claimed ?? "nothing"}, and no orphaned process of this server was found. Check "netstat -ano | findstr :${port}".`);
    }
  }
}

if (!existsSync(pgCtl)) {
  console.log(`[!!] postgres is not running on ${where}, and there is no server to start at ${pgCtl}`);
  console.log(`     Set PG_BIN to the directory holding pg_ctl and PG_DATA to the data directory, in .env.local.`);
  exitFailing();
}
if (!existsSync(path.join(data, "PG_VERSION"))) {
  console.log(`[!!] ${data} is not a Postgres data directory (no PG_VERSION). Set PG_DATA in .env.local.`);
  exitFailing();
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
