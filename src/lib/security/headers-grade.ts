// Grading live response headers against the securityheaders.com rules
// (brief §3.7). Read only: this module never changes a header, it only
// reports on what the server sent. Pure, so the unit tests drive it with
// literal header maps.
//
// The rules follow scotthelme's published grading: the six headers below are
// scored, missing ones cost a grade, and a few weak values are called out.

export type HeaderCheck = {
  header: string;
  present: boolean;
  value: string | null;
  status: "pass" | "warn" | "fail";
  // Why it passed or failed, in one sentence.
  detail: string;
  // What securityheaders.com looks for.
  expected: string;
};

export type HeaderReport = {
  url: string;
  status: number;
  grade: string;
  checks: HeaderCheck[];
  // Headers that leak server detail; securityheaders.com lists these
  // separately as "information disclosure".
  disclosures: { header: string; value: string }[];
};

const GRADED = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
] as const;

const EXPECTED: Record<(typeof GRADED)[number], string> = {
  "content-security-policy": "A policy that at least sets default-src and blocks framing",
  "strict-transport-security": "max-age of at least 31536000 (one year)",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY or SAMEORIGIN, or frame-ancestors in the CSP",
  "referrer-policy": "no-referrer, same-origin, strict-origin or strict-origin-when-cross-origin",
  "permissions-policy": "A policy restricting the features this site does not use",
};

const DISCLOSURE_HEADERS = ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"];

function get(headers: Record<string, string>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

function checkCsp(value: string | null): Pick<HeaderCheck, "status" | "detail"> {
  if (!value) return { status: "fail", detail: "Not set: every script, style and frame source is allowed." };
  const policy = value.toLowerCase();
  if (!policy.includes("default-src") && !policy.includes("script-src")) {
    return { status: "fail", detail: "Set, but neither default-src nor script-src is present, so scripts are unrestricted." };
  }
  const notes: string[] = [];
  if (policy.includes("'unsafe-inline'")) notes.push("allows 'unsafe-inline'");
  if (policy.includes("'unsafe-eval'")) notes.push("allows 'unsafe-eval'");
  if (!policy.includes("frame-ancestors")) notes.push("no frame-ancestors");
  if (!policy.includes("base-uri")) notes.push("no base-uri");
  if (!policy.includes("form-action")) notes.push("no form-action");
  if (notes.length === 0) return { status: "pass", detail: "Set, with no unsafe sources." };
  return { status: "warn", detail: `Set, but it ${notes.join(", ")}. A nonce based policy would remove the unsafe sources.` };
}

function checkHsts(value: string | null): Pick<HeaderCheck, "status" | "detail"> {
  if (!value) return { status: "fail", detail: "Not set: a first visit over http is not upgraded." };
  const age = Number(value.match(/max-age\s*=\s*(\d+)/i)?.[1] ?? "0");
  if (age < 31_536_000) return { status: "warn", detail: `max-age is ${age} seconds, under the one year securityheaders.com looks for.` };
  const extras = [/includesubdomains/i.test(value) ? null : "no includeSubDomains", /preload/i.test(value) ? null : "not preload ready"].filter(Boolean);
  if (extras.length) return { status: "warn", detail: `max-age is ${age} seconds, but ${extras.join(" and ")}.` };
  return { status: "pass", detail: `max-age ${age} seconds, includeSubDomains and preload.` };
}

function checkFrame(value: string | null, csp: string | null): Pick<HeaderCheck, "status" | "detail"> {
  const framedByCsp = csp ? /frame-ancestors/i.test(csp) : false;
  if (!value) {
    return framedByCsp
      ? { status: "pass", detail: "Not set, but the CSP sets frame-ancestors, which supersedes it." }
      : { status: "fail", detail: "Not set and the CSP has no frame-ancestors: the site can be framed." };
  }
  const v = value.trim().toUpperCase();
  if (v === "DENY" || v === "SAMEORIGIN") return { status: "pass", detail: `${v}: framing is restricted.` };
  return { status: "warn", detail: `"${value}" is not a value browsers still honour; use DENY or SAMEORIGIN.` };
}

function checkNosniff(value: string | null): Pick<HeaderCheck, "status" | "detail"> {
  if (!value) return { status: "fail", detail: "Not set: browsers may guess a response's content type." };
  return value.trim().toLowerCase() === "nosniff"
    ? { status: "pass", detail: "nosniff: content types are taken as sent." }
    : { status: "fail", detail: `"${value}" is not a valid value; the only one is nosniff.` };
}

const GOOD_REFERRER = ["no-referrer", "no-referrer-when-downgrade", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];

function checkReferrer(value: string | null): Pick<HeaderCheck, "status" | "detail"> {
  if (!value) return { status: "fail", detail: "Not set: the full URL is sent to other sites." };
  const parts = value.split(",").map((p) => p.trim().toLowerCase());
  const effective = parts[parts.length - 1];
  if (effective === "unsafe-url" || effective === "origin-when-cross-origin" || effective === "origin") {
    return { status: "warn", detail: `"${effective}" still sends the origin or the whole URL across sites.` };
  }
  return GOOD_REFERRER.includes(effective)
    ? { status: "pass", detail: `${effective}: referrers are restricted across origins.` }
    : { status: "warn", detail: `"${value}" is not a recognised policy.` };
}

function checkPermissions(value: string | null): Pick<HeaderCheck, "status" | "detail"> {
  if (!value) return { status: "fail", detail: "Not set: every browser feature is available to this page and its frames." };
  const restricted = (value.match(/=\s*\(\s*\)/g) ?? []).length;
  return restricted > 0
    ? { status: "pass", detail: `${restricted} feature${restricted === 1 ? "" : "s"} disabled outright.` }
    : { status: "warn", detail: "Set, but no feature is disabled outright." };
}

// securityheaders.com starts at A+ and steps down per missing header, with a
// warning counting as a partial miss.
function grade(checks: HeaderCheck[]): string {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails === 0 && warns === 0) return "A+";
  if (fails === 0) return warns <= 2 ? "A" : "B";
  const scale = ["A", "B", "C", "D", "E", "F"];
  return scale[Math.min(fails, scale.length - 1)];
}

export function gradeHeaders(url: string, status: number, headers: Record<string, string>): HeaderReport {
  const csp = get(headers, "content-security-policy");
  const results: Record<(typeof GRADED)[number], Pick<HeaderCheck, "status" | "detail">> = {
    "content-security-policy": checkCsp(csp),
    "strict-transport-security": checkHsts(get(headers, "strict-transport-security")),
    "x-content-type-options": checkNosniff(get(headers, "x-content-type-options")),
    "x-frame-options": checkFrame(get(headers, "x-frame-options"), csp),
    "referrer-policy": checkReferrer(get(headers, "referrer-policy")),
    "permissions-policy": checkPermissions(get(headers, "permissions-policy")),
  };
  const checks: HeaderCheck[] = GRADED.map((h) => {
    const value = get(headers, h);
    return { header: h, present: value !== null, value, expected: EXPECTED[h], ...results[h] };
  });
  const disclosures = DISCLOSURE_HEADERS.map((h) => ({ header: h, value: get(headers, h) ?? "" })).filter((d) => d.value !== "");
  return { url, status, grade: grade(checks), checks, disclosures };
}

// Header names worth showing in full alongside the graded ones.
export const INTERESTING_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "x-dns-prefetch-control",
  "x-robots-tag",
  "cache-control",
  "content-type",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
];
