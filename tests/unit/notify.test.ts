import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverNotice, emailDeliveryStatus, type Notice } from "@/lib/notify";

// SMTP is nodemailer underneath; here it is a transport that records what it
// was asked to send, and fails on command.
const smtpMock = vi.hoisted(() => ({
  sendMail: vi.fn<(message: Record<string, unknown>) => Promise<unknown>>(),
  options: null as Record<string, unknown> | null,
}));
vi.mock("nodemailer", () => ({
  createTransport: (options: Record<string, unknown>) => {
    smtpMock.options = options;
    return { sendMail: smtpMock.sendMail, close: () => {} };
  },
}));

// The admin notice chain: Resend, then the webhook, then FormSubmit, the same
// road the contact form takes. These prove the order, that a failure moves on
// to the next channel, that every failure is named in the outcome, and that
// the outcome never lies about which channel carried the message.

const notice: Notice = {
  to: "admin@develmo.test",
  subject: "Access request from Ada Lovelace",
  text: "Ada asked for access.",
  fields: { name: "Ada Lovelace", email: "ada@lovelace.test" },
  replyTo: "ada@lovelace.test",
};

type Call = { url: string; body: Record<string, unknown> };

function mockFetch(handler: (url: string, body: Record<string, unknown>) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body });
      return handler(url, body);
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("CONTACT_WEBHOOK_URL", "");
  vi.stubEnv("FORMSUBMIT_URL", "");
  vi.stubEnv("CONTACT_FROM", "");
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_SECURE"]) vi.stubEnv(k, "");
  smtpMock.sendMail.mockReset();
  smtpMock.sendMail.mockResolvedValue({ accepted: [notice.to] });
  smtpMock.options = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("deliverNotice", () => {
  it("uses Resend first when a key is set, addressed to the notice recipient", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    const calls = mockFetch(() => new Response("{}", { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome).toEqual({ status: "sent", channel: "resend", error: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].body).toMatchObject({ to: "admin@develmo.test", reply_to: "ada@lovelace.test", subject: notice.subject });
  });

  it("falls through Resend to the webhook, and names the Resend failure in the outcome", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    const calls = mockFetch((url) => (url.includes("resend") ? new Response("nope", { status: 401 }) : new Response("{}", { status: 200 })));
    const outcome = await deliverNotice(notice);
    expect(outcome.status).toBe("sent");
    expect(outcome.channel).toBe("webhook");
    expect(outcome.error).toContain("resend: Resend error 401");
    expect(calls.map((c) => c.url)).toEqual(["https://api.resend.com/emails", "https://hook.test/in"]);
    expect(calls[1].body).toMatchObject({ kind: "notice", to: "admin@develmo.test", name: "Ada Lovelace" });
  });

  it("ends at FormSubmit, addressed per recipient, when nothing else is configured", async () => {
    vi.stubEnv("FORMSUBMIT_URL", "https://formsubmit.test/ajax");
    const calls = mockFetch(() => new Response(JSON.stringify({ success: "true" }), { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome).toEqual({ status: "sent", channel: "formsubmit", error: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://formsubmit.test/ajax/admin@develmo.test");
    expect(calls[0].body).toMatchObject({ _subject: notice.subject, _replyto: "ada@lovelace.test", name: "Ada Lovelace", message: notice.text });
  });

  it("treats a FormSubmit body that says success false as a failure", async () => {
    vi.stubEnv("FORMSUBMIT_URL", "https://formsubmit.test/ajax");
    mockFetch(() => new Response(JSON.stringify({ success: false, message: "not activated" }), { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome.status).toBe("failed");
    expect(outcome.channel).toBeNull();
    expect(outcome.error).toContain("formsubmit: FormSubmit rejected the message");
  });

  it("reports every channel's failure when all of them fail, and never throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    vi.stubEnv("FORMSUBMIT_URL", "https://formsubmit.test/ajax");
    mockFetch((url) => {
      if (url.includes("resend")) return new Response("", { status: 500 });
      if (url.includes("hook.test")) throw new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
      return new Response("", { status: 503 });
    });
    const outcome = await deliverNotice(notice);
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toContain("resend: Resend error 500");
    expect(outcome.error).toContain("webhook: fetch failed (ECONNREFUSED)");
    expect(outcome.error).toContain("formsubmit: FormSubmit error 503");
  });

  it("uses SMTP after Resend and before the webhook, with the notice's reply-to", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("SMTP_PASS", "abcd efgh ijkl mnop");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    const calls = mockFetch(() => new Response("{}", { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome).toEqual({ status: "sent", channel: "smtp", error: null });
    expect(calls).toEqual([]);
    expect(smtpMock.sendMail).toHaveBeenCalledTimes(1);
    expect(smtpMock.sendMail.mock.calls[0][0]).toEqual({ from: "DevelMo <owner@gmail.com>", to: "admin@develmo.test", replyTo: "ada@lovelace.test", subject: notice.subject, text: notice.text });
    // Port 587 starts plain and must upgrade, and the spaces Google shows in
    // an app password are not part of it.
    expect(smtpMock.options).toMatchObject({ host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true, auth: { user: "owner@gmail.com", pass: "abcdefghijklmnop" } });
  });

  it("names a refused SMTP login in plain words and moves on to the webhook", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("SMTP_PASS", "wrong");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    smtpMock.sendMail.mockRejectedValue(Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), { code: "EAUTH", responseCode: 535 }));
    const calls = mockFetch(() => new Response("{}", { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome.status).toBe("sent");
    expect(outcome.channel).toBe("webhook");
    expect(outcome.error).toBe(
      "smtp: SMTP login refused by smtp.gmail.com:587 (EAUTH 535). Gmail only accepts an app password here, which needs 2-Step Verification turned on for the account; the normal account password is refused",
    );
    expect(calls.map((c) => c.url)).toEqual(["https://hook.test/in"]);
  });

  it("does not try SMTP while a variable is missing, and the status says which", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("FORMSUBMIT_URL", "https://formsubmit.test/ajax");
    mockFetch(() => new Response(JSON.stringify({ success: "true" }), { status: 200 }));
    const outcome = await deliverNotice(notice);
    expect(outcome.channel).toBe("formsubmit");
    expect(smtpMock.sendMail).not.toHaveBeenCalled();
    expect(emailDeliveryStatus().smtp).toMatchObject({ configured: false, missing: ["SMTP_PASS"], host: "smtp.gmail.com", user: "owner@gmail.com", gmail: true });
  });
});

describe("emailDeliveryStatus", () => {
  it("describes the environment without exposing a secret", () => {
    vi.stubEnv("RESEND_API_KEY", "re_secret_value");
    vi.stubEnv("CONTACT_FROM", "DevelMo <hello@develmo.com>");
    vi.stubEnv("CONTACT_WEBHOOK_URL", "https://hook.test/in");
    const status = emailDeliveryStatus();
    expect(status.resend).toEqual({ configured: true, from: "DevelMo <hello@develmo.com>", fromIsShared: false });
    expect(status.webhook.configured).toBe(true);
    expect(status.formsubmit).toEqual({ endpoint: "https://formsubmit.co/ajax", overridden: false });
    expect(JSON.stringify(status)).not.toContain("re_secret_value");
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "owner@gmail.com");
    vi.stubEnv("SMTP_PASS", "app-password-value");
    const withSmtp = emailDeliveryStatus();
    expect(withSmtp.smtp).toEqual({ configured: true, missing: [], host: "smtp.gmail.com", port: 587, user: "owner@gmail.com", from: "DevelMo <owner@gmail.com>", gmail: true });
    expect(JSON.stringify(withSmtp)).not.toContain("app-password-value");
  });

  it("flags Resend's shared onboarding sender, which only delivers to the account owner", () => {
    const status = emailDeliveryStatus();
    expect(status.resend.configured).toBe(false);
    expect(status.resend.fromIsShared).toBe(true);
  });
});
