#!/usr/bin/env node
// Sends one real email through the SMTP settings in .env.local and reports
// what happened, so an app password can be checked from the terminal without
// signing in to the console.
//
//   npm run email:test                      to CONTACT_TO, else SMTP_USER
//   npm run email:test -- you@example.com   to that address
//
// Exit code 0 only when the server accepted the message.

import { existsSync } from "node:fs";
import nodemailer from "nodemailer";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const env = (k) => (process.env[k] ?? "").trim();
const host = env("SMTP_HOST");
const user = env("SMTP_USER");
const rawPass = env("SMTP_PASS");
// Google shows an app password as four groups of four letters; the spaces are not part of it.
const pass = /^[a-z]{4}( [a-z]{4}){3}$/i.test(rawPass) ? rawPass.replace(/ /g, "") : rawPass;
const port = Number.parseInt(env("SMTP_PORT"), 10) || 587;
const secureVar = env("SMTP_SECURE").toLowerCase();
const secure = secureVar ? secureVar === "true" || secureVar === "1" : port === 465;
const from = env("SMTP_FROM") || `DevelMo <${user}>`;
const gmail = /(^|\.)(gmail|googlemail)\.com$/i.test(host);
const to = process.argv[2] || env("CONTACT_TO") || user;

const missing = [["SMTP_HOST", host], ["SMTP_USER", user], ["SMTP_PASS", pass]].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.log(`[!!] Not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty in .env.local.`);
  if (gmail || missing.includes("SMTP_HOST")) {
    console.log("     For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_USER=the Gmail address, SMTP_PASS=an app password");
    console.log("     from https://myaccount.google.com/apppasswords (2-Step Verification must be on for the account).");
  }
  process.exit(1);
}

function explain(err) {
  const code = typeof err?.code === "string" ? err.code : "";
  const rc = err?.responseCode ? ` ${err.responseCode}` : "";
  if (code === "EAUTH" || err?.responseCode === 535 || err?.responseCode === 534) {
    const hint = gmail
      ? "Gmail only accepts an app password here, and only when 2-Step Verification is on for the account. Create one at https://myaccount.google.com/apppasswords and paste all 16 letters into SMTP_PASS."
      : "Check SMTP_USER and SMTP_PASS.";
    return `Login refused by ${host}:${port} (EAUTH${rc}). ${hint}`;
  }
  if (["ECONNECTION", "ESOCKET", "ETIMEDOUT", "EDNS", "ECONNREFUSED"].includes(code)) {
    return `Could not connect to ${host}:${port} (${code}). Check SMTP_HOST and SMTP_PORT, and that this network allows outbound port ${port}.`;
  }
  const base = err?.message ?? String(err);
  return code && !String(base).includes(code) ? `${base} (${code})` : base;
}

console.log(`[..] ${host}:${port} as ${user} (${secure ? "TLS" : "STARTTLS"}), from ${from}, to ${to}`);
const transport = nodemailer.createTransport({ host, port, secure, requireTLS: !secure, auth: { user, pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 });

try {
  await transport.verify();
  console.log(`[ok] Logged in to ${host}:${port} as ${user}.`);
} catch (err) {
  console.log(`[!!] ${explain(err)}`);
  transport.close();
  process.exit(1);
}

const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
try {
  const info = await transport.sendMail({
    from,
    to,
    subject: "DevelMo: SMTP test",
    text: [`This is a test sent by npm run email:test at ${when}.`, "", `If you are reading it, the DevelMo site can send email through ${host} as ${user}.`].join("\n"),
  });
  console.log(`[ok] Accepted by ${host}: ${String(info.response ?? "").trim() || "queued"}.`);
  console.log(`     Check the inbox of ${to}, and its spam folder the first time.`);
  if (gmail) console.log(`     Gmail sends as the account itself, so the message is from ${user} whatever SMTP_FROM says.`);
} catch (err) {
  console.log(`[!!] ${explain(err)}`);
  process.exitCode = 1;
} finally {
  transport.close();
}
