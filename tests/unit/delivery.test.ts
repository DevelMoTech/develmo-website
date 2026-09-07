import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryText, formSubmitUrl, qaAddress, runDeliveryChain, type SubmissionRow } from "@/lib/submissions/delivery";
import { renderReply, mailtoFor } from "@/lib/submissions/reply";
import { DEFAULT_REPLY_TEMPLATE } from "@/lib/admin/settings";

const row: SubmissionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "contact",
  status: "new",
  name: "Ada Lovelace",
  email: "ada@lovelace.test",
  phone: "",
  company: "Analytical Engines",
  message: "We need a vision system.",
  formService: "CrowdIQ",
  qualifiers: { service: "CrowdIQ", industry: "retail", intent: "demo" },
  service: "CrowdIQ",
  industry: "retail",
  intent: "demo",
  budget: "",
  product: "",
  source: "",
  topic: "",
  region: "",
  referrer: "",
  landingPage: "/contact-develmo",
  utm: null,
  locale: "en",
  userAgent: null,
  ipHash: null,
  isSpam: false,
  spamReason: null,
  deliveryStatus: "pending",
  deliveryError: null,
  deliveryChannel: null,
  deliveryAttempts: 0,
  deliveredAt: null,
  lastDeliveryAt: null,
  readAt: null,
  assigneeId: null,
  tags: [],
  applicationId: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
};

const ENV = ["RESEND_API_KEY", "CONTACT_WEBHOOK_URL", "FORMSUBMIT_URL", "CONTACT_TO"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      return handler(url, init);
    }),
  );
  return calls;
}

describe("deliveryText", () => {
  it("rebuilds the pre-rewrite email text with the qualifiers appended as [Context]", () => {
    const { subject, text, fields } = deliveryText(row);
    expect(subject).toBe("New enquiry from Ada Lovelace");
    expect(text).toBe(["Name: Ada Lovelace", "Email: ada@lovelace.test", "Company: Analytical Engines", "Service: CrowdIQ", "We need a vision system.\n\n[Context] service=CrowdIQ, industry=retail, intent=demo"].join("\n"));
    expect(fields.phone).toBe("Not given");
    expect(fields.message).toContain("[Context] service=CrowdIQ");
  });
});

describe("runDeliveryChain", () => {
  it("skips QA addresses without touching the network", async () => {
    const calls = mockFetch(() => new Response("{}"));
    expect(qaAddress("test@example.com")).toBe(true);
    const outcome = await runDeliveryChain({ ...row, email: "test@example.com" });
    expect(outcome).toEqual({ status: "skipped", channel: null, error: "QA address (@example.*), not delivered" });
    expect(calls).toEqual([]);
  });

  it("uses Resend first when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const calls = mockFetch(() => new Response("{}", { status: 200 }));
    expect(await runDeliveryChain(row)).toEqual({ status: "sent", channel: "resend", error: null });
    expect(calls).toEqual(["https://api.resend.com/emails"]);
  });

  it("falls through Resend -> webhook -> FormSubmit and keeps every error when all fail", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example.test/contact";
    process.env.FORMSUBMIT_URL = "https://forms.example.test/ajax";
    const calls = mockFetch((url) => {
      if (url.includes("resend")) return new Response("", { status: 500 });
      if (url.includes("hooks")) throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
      return new Response(JSON.stringify({ success: "false" }), { status: 200 });
    });
    const outcome = await runDeliveryChain(row);
    expect(calls).toEqual(["https://api.resend.com/emails", "https://hooks.example.test/contact", "https://forms.example.test/ajax/s.shahzeb8874@gmail.com"]);
    expect(outcome.status).toBe("failed");
    expect(outcome.channel).toBeNull();
    expect(outcome.error).toBe("resend: Resend error 500; webhook: fetch failed (ECONNREFUSED); formsubmit: FormSubmit rejected the submission");
  });

  it("records the earlier failures even when a later channel succeeds", async () => {
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example.test/contact";
    process.env.FORMSUBMIT_URL = "https://forms.example.test/ajax";
    process.env.CONTACT_TO = "inbox@develmo.test";
    const calls = mockFetch((url) => (url.includes("hooks") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ success: "true" }))));
    const outcome = await runDeliveryChain(row);
    expect(calls).toEqual(["https://hooks.example.test/contact", "https://forms.example.test/ajax/inbox@develmo.test"]);
    expect(outcome).toEqual({ status: "sent", channel: "formsubmit", error: "webhook: Webhook error 503" });
  });

  it("defaults FormSubmit to the real service and honours the override", () => {
    expect(formSubmitUrl("a@b.test")).toBe("https://formsubmit.co/ajax/a@b.test");
    process.env.FORMSUBMIT_URL = "http://127.0.0.1:9/formsubmit/";
    expect(formSubmitUrl("a@b.test")).toBe("http://127.0.0.1:9/formsubmit/a@b.test");
  });
});

describe("renderReply", () => {
  it("fills the placeholders and builds a mailto link", () => {
    const reply = renderReply(DEFAULT_REPLY_TEMPLATE, row);
    expect(reply.subject).toBe("Re: your enquiry to DevelMo");
    expect(reply.body).toContain("Hi Ada,");
    expect(reply.body).toContain("about CrowdIQ.");
    const link = mailtoFor(row.email, reply);
    expect(link.startsWith("mailto:ada%40lovelace.test?subject=Re%3A%20your%20enquiry")).toBe(true);
    expect(decodeURIComponent(link.split("&body=")[1])).toContain("Hi Ada,");
    expect(renderReply({ subject: "{{company}} / {{service}}", body: "{{message}}" }, { ...row, service: "" })).toEqual({ subject: "Analytical Engines / your project", body: "We need a vision system." });
  });
});
