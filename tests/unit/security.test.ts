import { describe, expect, it } from "vitest";
import { cidrSize, ipInCidr, parseCidr, parseIp } from "@/lib/security/cidr";
import { evaluateAccess, type AccessRuleSet } from "@/lib/security/access";
import { collectInstalled, summarise } from "@/lib/security/deps";
import { gradeHeaders } from "@/lib/security/headers-grade";
import { accessRuleSchema, rateLimitSchema, turnstileSchema } from "@/lib/schemas/security";

const inRange = (ip: string, cidr: string) => {
  const a = parseIp(ip);
  const c = parseCidr(cidr);
  if (!a || !c) throw new Error(`unparseable: ${ip} / ${cidr}`);
  return ipInCidr(a, c);
};

describe("CIDR parsing and matching", () => {
  it("parses IPv4, rejects malformed forms, and normalises what it stores", () => {
    expect(parseIp("203.0.113.9")?.family).toBe(4);
    expect(parseIp("203.0.113.9:443")?.family).toBe(4);
    expect(parseIp("256.0.0.1")).toBeNull();
    expect(parseIp("010.0.0.1")).toBeNull();
    expect(parseIp("203.0.113")).toBeNull();
    expect(parseCidr("203.0.113.0/24")?.text).toBe("203.0.113.0/24");
    expect(parseCidr("203.0.113.9")?.text).toBe("203.0.113.9");
    expect(parseCidr("203.0.113.0/33")).toBeNull();
  });

  it("parses IPv6 in its compressed, bracketed and mapped forms", () => {
    expect(parseIp("::1")?.family).toBe(6);
    expect(parseIp("[2001:db8::1]:443")?.family).toBe(6);
    expect(parseIp("fe80::1%eth0")?.family).toBe(6);
    expect(parseIp("2001:db8:0:0:0:0:0:1")?.bytes).toEqual(parseIp("2001:db8::1")?.bytes);
    // An IPv4-mapped IPv6 address is the same address as its IPv4 form.
    expect(parseIp("::ffff:203.0.113.9")?.bytes).toEqual(parseIp("203.0.113.9")?.bytes);
    expect(parseIp("::ffff:203.0.113.9")?.family).toBe(4);
    expect(parseIp("2001:db8:::1")).toBeNull();
    expect(parseIp("gggg::1")).toBeNull();
    expect(parseCidr("2001:db8::/32")?.text).toBe("2001:db8::/32");
    expect(parseCidr("2001:db8::/129")).toBeNull();
  });

  it("matches addresses inside a range and excludes the ones outside", () => {
    expect(inRange("203.0.113.9", "203.0.113.0/24")).toBe(true);
    expect(inRange("203.0.114.9", "203.0.113.0/24")).toBe(false);
    // A boundary that does not fall on a byte.
    expect(inRange("203.0.113.130", "203.0.113.128/25")).toBe(true);
    expect(inRange("203.0.113.127", "203.0.113.128/25")).toBe(false);
    expect(inRange("203.0.113.9", "0.0.0.0/0")).toBe(true);
    // The two families meet through the mapped form.
    expect(inRange("::ffff:203.0.113.9", "203.0.113.0/24")).toBe(true);
    expect(inRange("2001:db8::5", "2001:db8::/32")).toBe(true);
    expect(inRange("2001:db9::5", "2001:db8::/32")).toBe(false);
    expect(inRange("203.0.113.9", "2001:db8::/32")).toBe(false);
  });

  it("reports how many addresses a rule covers", () => {
    expect(cidrSize(parseCidr("203.0.113.9")!)).toBe(1);
    expect(cidrSize(parseCidr("203.0.113.0/24")!)).toBe(256);
    expect(cidrSize(parseCidr("203.0.0.0/16")!)).toBe(65_536);
  });
});

describe("access evaluation", () => {
  const set = (rules: AccessRuleSet["rules"]): AccessRuleSet => ({ rules, generatedAt: "2026-01-01T00:00:00.000Z" });
  const rule = (cidr: string, action: "block" | "allow", expiresAt: string | null = null) => ({ id: cidr, cidr, action, reason: "", expiresAt });

  it("blocks a matching address and leaves everything else alone", () => {
    const rules = set([rule("203.0.113.0/24", "block")]);
    expect(evaluateAccess(rules, "203.0.113.9").allowed).toBe(false);
    expect(evaluateAccess(rules, "198.51.100.1").allowed).toBe(true);
    expect(evaluateAccess(null, "203.0.113.9").allowed).toBe(true);
    expect(evaluateAccess(set([]), "203.0.113.9").allowed).toBe(true);
    // An unparseable address is never blocked by accident.
    expect(evaluateAccess(rules, "unknown").allowed).toBe(true);
  });

  it("lets an allow rule override a block, which is the way out of a wide rule", () => {
    const rules = set([rule("203.0.113.0/24", "block"), rule("203.0.113.9", "allow")]);
    expect(evaluateAccess(rules, "203.0.113.9").allowed).toBe(true);
    expect(evaluateAccess(rules, "203.0.113.10").allowed).toBe(false);
  });

  it("ignores an expired rule and reports the most specific block", () => {
    const past = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(evaluateAccess(set([rule("203.0.113.0/24", "block", past)]), "203.0.113.9", now).allowed).toBe(true);
    const decision = evaluateAccess(set([rule("203.0.0.0/16", "block"), rule("203.0.113.9", "block")]), "203.0.113.9", now);
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.rule.cidr).toBe("203.0.113.9");
  });
});

describe("security schemas", () => {
  it("accepts a valid rule and rejects an address that is not one", () => {
    expect(accessRuleSchema.safeParse({ cidr: "203.0.113.0/24", action: "block", reason: "abuse", expiresAt: "", confirm: "" }).success).toBe(true);
    expect(accessRuleSchema.safeParse({ cidr: "not-an-ip", action: "block" }).success).toBe(false);
    expect(accessRuleSchema.safeParse({ cidr: "203.0.113.9", action: "sideways" }).success).toBe(false);
    expect(accessRuleSchema.safeParse({ cidr: "203.0.113.9", action: "block", expiresAt: "next tuesday" }).success).toBe(false);
  });

  it("holds rate limits and site keys to sane shapes", () => {
    expect(rateLimitSchema.safeParse({ key: "contact", maxRequests: 20, windowSeconds: 60 }).success).toBe(true);
    expect(rateLimitSchema.safeParse({ key: "contact", maxRequests: 0, windowSeconds: 60 }).success).toBe(false);
    expect(rateLimitSchema.safeParse({ key: "contact", maxRequests: 5, windowSeconds: 5 }).success).toBe(false);
    expect(rateLimitSchema.safeParse({ key: "not-an-endpoint", maxRequests: 5, windowSeconds: 60 }).success).toBe(false);
    expect(turnstileSchema.safeParse({ enabled: true, siteKey: "0x4AAAAAAA_key" }).success).toBe(true);
    expect(turnstileSchema.safeParse({ enabled: true, siteKey: "<script>" }).success).toBe(false);
  });
});

describe("header grading", () => {
  // What this site actually sends, from next.config.ts.
  const live = {
    "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };

  it("grades the live policy, flagging only the unsafe CSP sources", () => {
    const report = gradeHeaders("https://develmo.com/", 200, live);
    const byName = Object.fromEntries(report.checks.map((c) => [c.header, c]));
    expect(byName["strict-transport-security"].status).toBe("pass");
    expect(byName["x-content-type-options"].status).toBe("pass");
    expect(byName["x-frame-options"].status).toBe("pass");
    expect(byName["referrer-policy"].status).toBe("pass");
    expect(byName["permissions-policy"].status).toBe("pass");
    expect(byName["content-security-policy"].status).toBe("warn");
    expect(byName["content-security-policy"].detail).toMatch(/unsafe-inline/);
    expect(report.grade).toBe("A");
    expect(report.disclosures).toEqual([]);
  });

  it("fails the headers that are missing and names the disclosures", () => {
    const report = gradeHeaders("https://example.com/", 200, { server: "nginx/1.24.0", "x-powered-by": "Express" });
    expect(report.checks.every((c) => c.status === "fail")).toBe(true);
    expect(report.grade).toBe("F");
    expect(report.disclosures.map((d) => d.header)).toEqual(["server", "x-powered-by"]);
  });

  it("treats frame-ancestors in the CSP as covering a missing X-Frame-Options", () => {
    const { checks } = gradeHeaders("https://example.com/", 200, { "content-security-policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    const frame = checks.find((c) => c.header === "x-frame-options")!;
    expect(frame.status).toBe("pass");
    expect(frame.detail).toMatch(/frame-ancestors/);
  });

  it("warns on a short HSTS max-age and an over-sharing referrer policy", () => {
    const { checks } = gradeHeaders("https://example.com/", 200, { ...live, "strict-transport-security": "max-age=600", "referrer-policy": "unsafe-url" });
    expect(checks.find((c) => c.header === "strict-transport-security")!.status).toBe("warn");
    expect(checks.find((c) => c.header === "referrer-policy")!.status).toBe("warn");
  });
});

describe("dependency scan", () => {
  it("collects installed packages from a lockfile, keeping production reachability", () => {
    const installed = collectInstalled({
      packages: {
        "": { version: "0.1.0" },
        "node_modules/next": { version: "16.2.12" },
        "node_modules/vitest": { version: "4.1.11", dev: true },
        "node_modules/shared": { version: "1.0.0", dev: true },
        "node_modules/next/node_modules/shared": { version: "2.0.0" },
        "node_modules/linked": { version: "1.0.0", link: true },
      },
    });
    expect([...installed.keys()].sort()).toEqual(["next", "shared", "vitest"]);
    expect(installed.get("vitest")!.dev).toBe(true);
    // Reachable from production through next, so not a dev-only dependency.
    expect(installed.get("shared")!.dev).toBe(false);
    expect([...installed.get("shared")!.versions].sort()).toEqual(["1.0.0", "2.0.0"]);
  });

  it("counts advisories by severity", () => {
    const summary = summarise(
      [
        { package: "a", installed: ["1"], severity: "critical", title: "t", url: "u", vulnerableVersions: "<2", cwe: [], dev: false },
        { package: "b", installed: ["1"], severity: "high", title: "t", url: "u", vulnerableVersions: "<2", cwe: [], dev: true },
        { package: "c", installed: ["1"], severity: "high", title: "t", url: "u", vulnerableVersions: "<2", cwe: [], dev: false },
      ],
      120,
    );
    expect(summary).toMatchObject({ critical: 1, high: 2, moderate: 0, low: 0, info: 0, packages: 120, advisories: 3 });
  });
});
