// robots.txt: the editable body, its validity check, and the hard rule that
// /admin and /api/admin stay disallowed whatever the body says. Pure module,
// used by the served route, the editor's live preview and the unit tests.

import { site } from "@/lib/site";

export const PROTECTED_PATHS = ["/admin", "/api/admin"] as const;

// Cache tag for the served body; busted on every save.
export const ROBOTS_TAG = "robots";

// Byte for byte what src/app/robots.ts served before the editor existed.
export const DEFAULT_ROBOTS_BODY = ["User-Agent: *", "Allow: /", "Disallow: /api/", "Disallow: /studio", "Disallow: /admin", "Disallow: /api/admin", ""].join("\n");

const DIRECTIVES = new Set(["user-agent", "allow", "disallow", "sitemap", "crawl-delay", "host", "clean-param"]);

export type RobotsReport = { errors: string[]; warnings: string[] };

type Line = { n: number; raw: string; directive: string | null; value: string; comment: boolean; blank: boolean };

function parseLines(body: string): Line[] {
  return body.replace(/\r\n?/g, "\n").split("\n").map((raw, i) => {
    const text = raw.trim();
    if (!text) return { n: i + 1, raw, directive: null, value: "", comment: false, blank: true };
    if (text.startsWith("#")) return { n: i + 1, raw, directive: null, value: "", comment: true, blank: false };
    const colon = text.indexOf(":");
    if (colon < 0) return { n: i + 1, raw, directive: "", value: text, comment: false, blank: false };
    const directive = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).replace(/\s+#.*$/, "").trim();
    return { n: i + 1, raw, directive, value, comment: false, blank: false };
  });
}

// The protected URLs a rule must not be able to match: the roots and a
// representative child of each.
const PROTECTED_PROBES = PROTECTED_PATHS.flatMap((p) => [p, `${p}/`, `${p}/x`, `${p}/x/y`]);

// robots patterns: "*" matches any run of characters, "$" anchors the end,
// percent-encoding is compared decoded. A rule is protected-relevant when
// it could match any protected URL, so a wildcard such as "/*admin" or an
// encoded "/%61dmin" is caught as well as the plain prefix.
function patternMatches(pattern: string, url: string): boolean {
  let p = pattern.trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep as typed
  }
  const anchored = p.endsWith("$");
  if (anchored) p = p.slice(0, -1);
  const re = new RegExp(`^${p.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return re.test(url);
}

// An Allow can only out-rank the injected Disallow when its pattern is at
// least as long (crawlers pick the most specific rule by length), so a plain
// "Allow: /" is kept and "/*admin", "/admin*" or "/%61dmin" are dropped.
function allowThreatensProtected(path: string): boolean {
  const p = path.trim();
  if (!p) return false;
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    // keep as typed
  }
  const length = decoded.endsWith("$") ? decoded.length - 1 : decoded.length;
  return PROTECTED_PATHS.some((x) => length >= x.length && PROTECTED_PROBES.filter((probe) => probe.startsWith(x)).some((probe) => patternMatches(p, probe)));
}

// A Disallow that already covers a protected root exactly.
function disallowCovers(path: string): (typeof PROTECTED_PATHS)[number] | null {
  const p = path.trim();
  for (const x of PROTECTED_PATHS) if (p === x || p === `${x}/`) return x;
  return null;
}

// Structural validity: known directives only, every Allow/Disallow inside a
// User-agent group, paths that start with / or *, sane crawl delays.
export function validateRobots(body: string): RobotsReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (body.length > 20_000) errors.push("The file is longer than 20,000 characters");
  let inGroup = false;
  let groups = 0;
  let sitemapSeen = false;
  for (const line of parseLines(body)) {
    if (line.blank || line.comment) continue;
    if (line.directive === "") {
      errors.push(`Line ${line.n}: "${line.raw.trim()}" is not a directive (expected "Name: value")`);
      continue;
    }
    const d = line.directive as string;
    if (!DIRECTIVES.has(d)) {
      errors.push(`Line ${line.n}: unknown directive "${d}"`);
      continue;
    }
    if (d === "user-agent") {
      if (!line.value) errors.push(`Line ${line.n}: User-agent needs a value`);
      inGroup = true;
      groups += 1;
      continue;
    }
    if (d === "allow" || d === "disallow") {
      if (!inGroup) errors.push(`Line ${line.n}: ${d === "allow" ? "Allow" : "Disallow"} must follow a User-agent line`);
      if (line.value && !line.value.startsWith("/") && !line.value.startsWith("*")) errors.push(`Line ${line.n}: paths must start with / or *`);
      if (d === "allow" && allowThreatensProtected(line.value)) warnings.push(`Line ${line.n}: Allow for ${line.value} is ignored, ${PROTECTED_PATHS.join(" and ")} stay disallowed`);
      continue;
    }
    if (d === "crawl-delay") {
      if (!inGroup) errors.push(`Line ${line.n}: Crawl-delay must follow a User-agent line`);
      if (!/^\d+(\.\d+)?$/.test(line.value) || Number(line.value) > 60) errors.push(`Line ${line.n}: Crawl-delay must be a number of seconds up to 60`);
      continue;
    }
    if (d === "sitemap") {
      sitemapSeen = true;
      if (!/^https?:\/\/\S+$/i.test(line.value)) errors.push(`Line ${line.n}: Sitemap must be an absolute URL`);
      continue;
    }
    if (d === "host" && !line.value) errors.push(`Line ${line.n}: Host needs a value`);
  }
  if (groups === 0) warnings.push("No User-agent group: a \"User-agent: *\" group with the protected paths is added when served");
  if (!sitemapSeen) warnings.push(`No Sitemap line: ${site.url}/sitemap.xml is added when served`);
  return { errors, warnings };
}

// What is actually served. Every User-agent group gets the protected
// Disallow lines, any Allow for a protected path is dropped, a body with no
// group gets a "User-agent: *" group, and the Host and Sitemap lines are
// appended once. This is the hard rule; it does not depend on the body.
export function renderRobots(body: string): string {
  const lines = parseLines(body);
  const out: string[] = [];
  let groupOpen = false;
  let groupHas = new Set<string>();
  let hasGroup = false;
  let sitemapLines: string[] = [];
  let hostSeen = false;
  let lastWasUserAgent = false;

  const closeGroup = () => {
    if (!groupOpen) return;
    for (const p of PROTECTED_PATHS) if (!groupHas.has(p)) out.push(`Disallow: ${p}`);
    groupOpen = false;
    groupHas = new Set();
  };

  for (const line of lines) {
    if (line.blank) {
      lastWasUserAgent = false;
      // A blank line ends a group in the robots grammar.
      if (groupOpen) {
        closeGroup();
        out.push("");
      } else if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (line.comment) {
      out.push(line.raw.trim());
      continue;
    }
    const d = line.directive;
    const wasUserAgent = lastWasUserAgent;
    lastWasUserAgent = d === "user-agent";
    if (d === "user-agent") {
      // Consecutive User-agent lines share one group.
      if (groupOpen && wasUserAgent) {
        out.push(`User-Agent: ${line.value}`);
        continue;
      }
      closeGroup();
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(`User-Agent: ${line.value}`);
      groupOpen = true;
      hasGroup = true;
      continue;
    }
    if (d === "allow") {
      if (allowThreatensProtected(line.value)) continue;
      out.push(`Allow: ${line.value}`);
      continue;
    }
    if (d === "disallow") {
      const covered = disallowCovers(line.value);
      if (covered) groupHas.add(covered);
      out.push(`Disallow: ${line.value}`);
      continue;
    }
    if (d === "crawl-delay") {
      out.push(`Crawl-delay: ${line.value}`);
      continue;
    }
    if (d === "sitemap") {
      sitemapLines.push(`Sitemap: ${line.value}`);
      continue;
    }
    if (d === "host") {
      hostSeen = true;
      out.push(`Host: ${line.value}`);
      continue;
    }
    if (d === "clean-param") {
      out.push(`Clean-param: ${line.value}`);
      continue;
    }
    // Unknown or malformed lines are dropped from what is served.
  }
  closeGroup();
  if (!hasGroup) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push("User-Agent: *");
    for (const p of PROTECTED_PATHS) out.push(`Disallow: ${p}`);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  out.push("");
  if (!hostSeen) out.push(`Host: ${site.url}`);
  if (sitemapLines.length === 0) sitemapLines = [`Sitemap: ${site.url}/sitemap.xml`];
  out.push(...sitemapLines);
  return `${out.join("\n")}\n`;
}
