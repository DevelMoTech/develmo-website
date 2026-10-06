import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeSmtpError, normalisePassword, sendViaSmtp, smtpConfig, smtpStatus, verifySmtp } from "@/lib/smtp";
import { reservedAddress, sendEmail } from "@/lib/email";

// The SMTP transport as the delivery chains and the settings page see it:
// what counts as configured, what the page may show, how a failure is
// worded, and what nodemailer is asked to do.

const mock = vi.hoisted(() => ({
  sendMail: vi.fn<(message: Record<string, unknown>) => Promise<unknown>>(),
  verify: vi.fn(async (): Promise<unknown> => true),
  close: vi.fn(),
  options: null as Record<string, unknown> | null,
}));
vi.mock("nodemailer", () => ({
  createTransport: (options: Record<string, unknown>) => {
    mock.options = options;
    return { sendMail: mock.sendMail, verify: mock.verify, close: mock.close };
  },
}));

const VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_SECURE", "SMTP_AUTH_METHOD", "GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REFRESH_TOKEN", "RESEND_API_KEY"];

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const k of VARS) vi.stubEnv(k, "");
  mock.sendMail.mockReset();
  mock.sendMail.mockResolvedValue({});
  mock.verify.mockReset();
  mock.verify.mockResolvedValue(true);
  mock.close.mockReset();
  mock.options = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function gmail() {
  vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
  vi.stubEnv("SMTP_USER", "owner@gmail.com");
  vi.stubEnv("SMTP_PASS", "abcdefghijklmnop");
}

describe("normalisePassword", () => {
  it("drops the spaces Google shows in an app password and leaves anything else alone", () => {
    expect(normalisePassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalisePassword("  abcd efgh ijkl mnop ")).toBe("abcdefghijklmnop");
    expect(normalisePassword("abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(normalisePassword("my pass word")).toBe("my pass word");
    expect(normalisePassword("abcd efgh ijkl mno1")).toBe("abcd efgh ijkl mno1");
  });
});

describe("smtpConfig", () => {
  it("is null until host, user and password are all set", () => {
    expect(smtpConfig()).toBeNull();
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    expect(smtpConfig()).toBeNull();
    vi.stubEnv("SMTP_PASS", "secret");
    expect(smtpConfig()).toEqual({ host: "smtp.gmail.com", port: 587, secure: false, user: "owner@gmail.com", from: "DevelMo <owner@gmail.com>", auth: { type: "password", pass: "secret" } });
  });

  it("uses Gmail OAuth when explicitly selected and all OAuth secrets are present", () => {
    vi.stubEnv("SMTP_AUTH_METHOD", "gmail-oauth");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_OAUTH_REFRESH_TOKEN", "refresh-token");
    expect(smtpConfig()).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "owner@gmail.com",
      from: "DevelMo <owner@gmail.com>",
      auth: { type: "gmail-oauth", clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    });
  });

  it("treats port 465 as TLS from the first byte, and honours SMTP_SECURE and SMTP_FROM", () => {
    gmail();
    vi.stubEnv("SMTP_PORT", "465");
    expect(smtpConfig()).toMatchObject({ port: 465, secure: true });
    vi.stubEnv("SMTP_PORT", "2525");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("SMTP_FROM", "DevelMo Website <owner@gmail.com>");
    expect(smtpConfig()).toMatchObject({ port: 2525, secure: true, from: "DevelMo Website <owner@gmail.com>" });
    vi.stubEnv("SMTP_PORT", "not a number");
    vi.stubEnv("SMTP_SECURE", "false");
    expect(smtpConfig()).toMatchObject({ port: 587, secure: false });
  });
});

describe("smtpStatus", () => {
  it("lists what is still missing and never carries the password", () => {
    expect(smtpStatus()).toEqual({ configured: false, missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"], host: null, port: 587, user: null, from: null, gmail: false, authMethod: "password", issue: null });
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    expect(smtpStatus()).toEqual({ configured: false, missing: ["SMTP_PASS"], host: "smtp.gmail.com", port: 587, user: "owner@gmail.com", from: "DevelMo <owner@gmail.com>", gmail: true, authMethod: "password", issue: null });
    vi.stubEnv("SMTP_PASS", "app-password-value");
    const status = smtpStatus();
    expect(status.configured).toBe(true);
    expect(status.missing).toEqual([]);
    expect(JSON.stringify(status)).not.toContain("app-password-value");
  });

  it("lists only missing OAuth values and never leaks OAuth secrets", () => {
    vi.stubEnv("SMTP_AUTH_METHOD", "gmail-oauth");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "client-id");
    const status = smtpStatus();
    expect(status).toMatchObject({ configured: false, missing: ["GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REFRESH_TOKEN"], authMethod: "gmail-oauth", issue: null });
    expect(JSON.stringify(status)).not.toContain("client-id");
  });
});

describe("describeSmtpError", () => {
  const cfg = { host: "smtp.gmail.com", port: 587, secure: false, user: "owner@gmail.com", from: "DevelMo <owner@gmail.com>", auth: { type: "password" as const, pass: "x" } };

  it("explains a refused login in Gmail terms when the host is Gmail", () => {
    const err = Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), { code: "EAUTH", responseCode: 535 });
    expect(describeSmtpError(err, cfg)).toBe(
      "SMTP login refused by smtp.gmail.com:587 (EAUTH 535). Gmail only accepts an app password here, which needs 2-Step Verification turned on for the account; the normal account password is refused",
    );
    expect(describeSmtpError(err, { ...cfg, host: "mail.example.com" })).toBe("SMTP login refused by mail.example.com:587 (EAUTH 535). Check SMTP_USER and SMTP_PASS");
  });

  it("explains an OAuth refusal without suggesting an app password", () => {
    const err = Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 });
    expect(describeSmtpError(err, { ...cfg, auth: { type: "gmail-oauth", clientId: "id", clientSecret: "secret", refreshToken: "token" } })).toBe(
      "SMTP login refused by smtp.gmail.com:587 (EAUTH 535). Gmail OAuth was refused. Check the OAuth client, refresh token and that Gmail SMTP access is permitted",
    );
  });

  it("points at the host and port when the connection never came up", () => {
    const err = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    expect(describeSmtpError(err, cfg)).toBe("Could not connect to smtp.gmail.com:587 (ETIMEDOUT). Check SMTP_HOST and SMTP_PORT, and that outbound port 587 is open from this server");
  });

  it("keeps the words of an unknown error, with its code once", () => {
    expect(describeSmtpError(Object.assign(new Error("Message failed: 552 too big"), { code: "EMESSAGE", responseCode: 552, response: "552 too big" }), cfg)).toBe("smtp.gmail.com:587 refused the message (EMESSAGE 552): 552 too big");
    expect(describeSmtpError(Object.assign(new Error("odd"), { code: "EWEIRD" }), cfg)).toBe("odd (EWEIRD)");
    expect(describeSmtpError("string failure", cfg)).toBe("string failure");
  });
});

describe("sendViaSmtp", () => {
  it("refuses to run unconfigured rather than sending nowhere", async () => {
    await expect(sendViaSmtp({ to: "a@b.test", subject: "s", text: "t" })).rejects.toThrow("SMTP is not configured");
    expect(mock.sendMail).not.toHaveBeenCalled();
  });

  it("opens a STARTTLS-only connection on 587, sends the envelope as given, and closes", async () => {
    gmail();
    await sendViaSmtp({ to: "admin@develmo.test", subject: "Hello", text: "Body", replyTo: "ada@lovelace.test" });
    expect(mock.options).toMatchObject({ host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true, auth: { user: "owner@gmail.com", pass: "abcdefghijklmnop" } });
    expect(mock.sendMail).toHaveBeenCalledWith({ from: "DevelMo <owner@gmail.com>", to: "admin@develmo.test", replyTo: "ada@lovelace.test", subject: "Hello", text: "Body" });
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it("uses OAuth 2 when Gmail OAuth is configured", async () => {
    vi.stubEnv("SMTP_AUTH_METHOD", "gmail-oauth");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("GMAIL_OAUTH_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GMAIL_OAUTH_REFRESH_TOKEN", "refresh-token");
    await sendViaSmtp({ to: "admin@develmo.test", subject: "Hello", text: "Body" });
    expect(mock.options).toMatchObject({
      auth: { type: "OAuth2", user: "owner@gmail.com", clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
    });
  });

  it("wraps a failure in plain words, keeps the original as the cause, and still closes", async () => {
    gmail();
    const original = Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 });
    mock.sendMail.mockRejectedValue(original);
    let failure: (Error & { cause?: unknown }) | null = null;
    try {
      await sendViaSmtp({ to: "a@b.test", subject: "s", text: "t" });
    } catch (e) {
      failure = e as Error & { cause?: unknown };
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toMatch(/^SMTP login refused by smtp\.gmail\.com:587 \(EAUTH 535\)\./);
    expect(failure!.cause).toBe(original);
    expect(mock.close).toHaveBeenCalledTimes(1);
  });
});

describe("verifySmtp", () => {
  it("logs in with a short timeout, sends nothing, and closes", async () => {
    gmail();
    await verifySmtp(smtpConfig()!);
    expect(mock.options).toMatchObject({ host: "smtp.gmail.com", connectionTimeout: 3000, greetingTimeout: 3000 });
    expect(mock.verify).toHaveBeenCalledTimes(1);
    expect(mock.sendMail).not.toHaveBeenCalled();
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it("reports a refused login the way a send would", async () => {
    gmail();
    mock.verify.mockRejectedValue(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 }));
    await expect(verifySmtp(smtpConfig()!)).rejects.toThrow(/^SMTP login refused by smtp\.gmail\.com:587 \(EAUTH 535\)\./);
    expect(mock.close).toHaveBeenCalledTimes(1);
  });
});

// Invitations, resets, acknowledgements and digests go through sendEmail,
// which now has SMTP behind Resend and refuses addresses that cannot exist.
describe("sendEmail", () => {
  const msg = { to: "person@develmo.example.org", subject: "Hi", text: "There" };

  it("knows the addresses that can never receive mail", () => {
    expect(reservedAddress("e2e-user@example.com")).toBe(true);
    expect(reservedAddress("visitor@e2e-durability.invalid")).toBe(true);
    expect(reservedAddress("admin@develmo.test")).toBe(true);
    expect(reservedAddress("someone@localhost")).toBe(true);
    expect(reservedAddress("person@develmo.example.org")).toBe(false);
    expect(reservedAddress("person@gmail.com")).toBe(false);
    expect(reservedAddress("person@example.co.uk")).toBe(false);
  });

  it("skips a reserved address without touching any provider, and says so", async () => {
    gmail();
    const result = await sendEmail({ ...msg, to: "e2e-user@example.com" });
    expect(result).toEqual({ sent: false, skipped: "reserved-address", error: "reserved test address, not delivered" });
    expect(mock.sendMail).not.toHaveBeenCalled();
  });

  it("is logged and not sent when neither Resend nor SMTP is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendEmail(msg);
    expect(result).toEqual({ sent: false, skipped: "no-provider" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("no provider configured");
    warn.mockRestore();
  });

  it("sends through SMTP when only SMTP is configured", async () => {
    gmail();
    expect(await sendEmail(msg)).toEqual({ sent: true });
    expect(mock.sendMail).toHaveBeenCalledWith({ from: "DevelMo <owner@gmail.com>", to: msg.to, replyTo: undefined, subject: "Hi", text: "There" });
  });

  it("tries Resend first, then SMTP when Resend refuses, and reports both when both fail", async () => {
    gmail();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(msg)).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.sendMail).toHaveBeenCalledTimes(1);

    mock.sendMail.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const result = await sendEmail(msg);
    expect(result.sent).toBe(false);
    expect(result.error).toBe("Resend error 403; Could not connect to smtp.gmail.com:587 (ECONNREFUSED). Check SMTP_HOST and SMTP_PORT, and that outbound port 587 is open from this server");
  });
});
