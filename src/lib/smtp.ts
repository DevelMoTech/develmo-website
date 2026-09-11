// Outbound mail over SMTP with a username and password: a Gmail account with
// an app password, or any mailbox provider. Configured entirely from the
// environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) and
// used by every path that sends mail, after Resend and before the webhook.
// The config reader never throws; a missing piece means "not configured" and
// the settings page says which piece. Sending throws, with a message that
// says what to fix, and the delivery chains record that message.

export type SmtpConfig = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };
export type SmtpMessage = { to: string; subject: string; text: string; replyTo?: string };
export type SmtpStatus = {
  configured: boolean;
  // The variables still needed before SMTP will be tried.
  missing: string[];
  host: string | null;
  port: number;
  user: string | null;
  from: string | null;
  // Gmail has rules of its own (app password, From rewritten to the
  // account), and the settings page spells them out when it applies.
  gmail: boolean;
};

const REQUIRED = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const;
const DEFAULT_PORT = 587;
const CONNECT_TIMEOUT_MS = 8000;
const SOCKET_TIMEOUT_MS = 15000;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isGmailHost(host: string): boolean {
  return /(^|\.)(gmail|googlemail)\.com$/i.test(host);
}

// Google shows an app password as four groups of four letters. Pasting it
// with the spaces is the usual slip, and the spaces are not part of it.
export function normalisePassword(raw: string): string {
  const s = raw.trim();
  return /^[a-z]{4}( [a-z]{4}){3}$/i.test(s) ? s.replace(/ /g, "") : s;
}

function readEnv() {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = normalisePassword(env("SMTP_PASS"));
  const port = Number.parseInt(env("SMTP_PORT"), 10) || DEFAULT_PORT;
  const secureVar = env("SMTP_SECURE").toLowerCase();
  // Port 465 is TLS from the first byte; anything else starts plain and
  // upgrades with STARTTLS, which sendViaSmtp makes mandatory.
  const secure = secureVar ? secureVar === "true" || secureVar === "1" : port === 465;
  const from = env("SMTP_FROM") || (user ? `DevelMo <${user}>` : "");
  return { host, user, pass, port, secure, from };
}

export function smtpConfig(): SmtpConfig | null {
  const e = readEnv();
  if (!e.host || !e.user || !e.pass) return null;
  return { host: e.host, port: e.port, secure: e.secure, user: e.user, pass: e.pass, from: e.from };
}

// What the settings page shows. Never includes the password.
export function smtpStatus(): SmtpStatus {
  const e = readEnv();
  const missing = REQUIRED.filter((v) => !env(v));
  return {
    configured: missing.length === 0,
    missing,
    host: e.host || null,
    port: e.port,
    user: e.user || null,
    from: e.from || null,
    gmail: isGmailHost(e.host),
  };
}

type SmtpError = Error & { code?: string; responseCode?: number; response?: string };

// One sentence that says what to fix. Nodemailer's own messages are accurate
// but assume you know SMTP; the people reading the delivery log do not.
export function describeSmtpError(err: unknown, cfg: SmtpConfig): string {
  const e = (err ?? {}) as SmtpError;
  const code = typeof e.code === "string" ? e.code : "";
  const where = `${cfg.host}:${cfg.port}`;
  const rc = e.responseCode ? ` ${e.responseCode}` : "";
  if (code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) {
    const hint = isGmailHost(cfg.host)
      ? "Gmail only accepts an app password here, which needs 2-Step Verification turned on for the account; the normal account password is refused"
      : "Check SMTP_USER and SMTP_PASS";
    return `SMTP login refused by ${where} (EAUTH${rc}). ${hint}`;
  }
  if (code === "ECONNECTION" || code === "ESOCKET" || code === "ETIMEDOUT" || code === "EDNS" || code === "ECONNREFUSED") {
    return `Could not connect to ${where} (${code}). Check SMTP_HOST and SMTP_PORT, and that outbound port ${cfg.port} is open from this server`;
  }
  if (code === "EENVELOPE") {
    return `${where} refused the sender or the recipient (EENVELOPE${rc}): ${e.response ?? e.message}`;
  }
  if (code === "EMESSAGE") {
    return `${where} refused the message (EMESSAGE${rc}): ${e.response ?? e.message}`;
  }
  const base = e instanceof Error ? e.message : String(err);
  return code && !base.includes(code) ? `${base} (${code})` : base;
}

// Sends one message and resolves when the server has accepted it. Throws
// with a plain-language message otherwise. Nodemailer is loaded here rather
// than at module level so importing this file costs nothing on a path that
// never sends, and so the edge bundle never sees a Node-only package.
async function transportFor(cfg: SmtpConfig, connectTimeoutMs: number) {
  const { createTransport } = await import("nodemailer");
  return createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Never send the password over a connection that did not upgrade.
    requireTLS: !cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: connectTimeoutMs,
    greetingTimeout: connectTimeoutMs,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

export async function sendViaSmtp(msg: SmtpMessage, cfg: SmtpConfig | null = smtpConfig()): Promise<void> {
  if (!cfg) throw new Error("SMTP is not configured");
  const transport = await transportFor(cfg, CONNECT_TIMEOUT_MS);
  try {
    await transport.sendMail({ from: cfg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text });
  } catch (err) {
    throw new Error(describeSmtpError(err, cfg), { cause: err });
  } finally {
    transport.close();
  }
}

// Connects and logs in without sending anything: the dashboard's health
// probe. Throws the same plain-language message a failed send would.
export async function verifySmtp(cfg: SmtpConfig, connectTimeoutMs = 3000): Promise<void> {
  const transport = await transportFor(cfg, connectTimeoutMs);
  try {
    await transport.verify();
  } catch (err) {
    throw new Error(describeSmtpError(err, cfg), { cause: err });
  } finally {
    transport.close();
  }
}
