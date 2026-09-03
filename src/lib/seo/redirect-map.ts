// The redirect map the proxy serves from memory. This module has no server
// imports so it can be bundled into src/proxy.ts and into unit tests.

export type RedirectRule = {
  source: string;
  destination: string;
  code: 301 | 302;
};

export type RedirectMap = {
  // Keyed by the normalised source path.
  rules: Record<string, RedirectRule>;
  generatedAt: string;
};

// Paths a database redirect must never capture: the crawler files whose
// content the console guarantees (robots.txt, the sitemap), the console and
// the API. Checked when a rule is saved and again when a request is matched.
export const RESERVED_PATH = /^\/(robots\.txt|sitemap(?:-[a-z0-9]+)?\.xml|admin|api)(\/|$)/i;

// One shape of a path for matching: a leading slash, no repeated slashes, no
// trailing slash except for the root, percent-encoding decoded where valid,
// and the same case as typed. Query strings and fragments are not part of a
// source.
export function normalizePath(input: string): string {
  let p = (input || "").trim();
  const q = p.search(/[?#]/);
  if (q >= 0) p = p.slice(0, q);
  try {
    p = decodeURIComponent(p);
  } catch {
    // Leave an undecodable path as typed.
  }
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function buildRedirectMap(rows: { source: string; destination: string; code: number }[], generatedAt: string): RedirectMap {
  const rules: Record<string, RedirectRule> = {};
  for (const r of rows) {
    const source = normalizePath(r.source);
    if (RESERVED_PATH.test(source)) continue;
    rules[source] = { source, destination: r.destination, code: r.code === 302 ? 302 : 301 };
  }
  return { rules, generatedAt };
}

export function matchRedirect(map: RedirectMap | null, pathname: string): RedirectRule | null {
  if (!map) return null;
  if (RESERVED_PATH.test(pathname)) return null;
  return map.rules[normalizePath(pathname)] ?? null;
}

// Where a matched request goes: a relative destination keeps the visitor's
// query string (so ?service=... survives a renamed page, merged ahead of any
// fragment), an absolute one is used as typed.
export function redirectTarget(rule: RedirectRule, origin: string, search: string): string {
  if (/^https?:\/\//i.test(rule.destination)) return rule.destination;
  const dest = rule.destination.startsWith("/") ? rule.destination : `/${rule.destination}`;
  const query = search.replace(/^\?/, "");
  if (!query) return `${origin}${dest}`;
  const hash = dest.indexOf("#");
  const base = hash >= 0 ? dest.slice(0, hash) : dest;
  const fragment = hash >= 0 ? dest.slice(hash) : "";
  return `${origin}${base}${base.includes("?") ? "&" : "?"}${query}${fragment}`;
}

// Cache tag for the map served by /api/seo/redirects; busted on every save.
export const REDIRECTS_TAG = "redirects";

// How long the proxy serves a map before refreshing it in the background.
export const REDIRECT_TTL_MS = 10_000;
