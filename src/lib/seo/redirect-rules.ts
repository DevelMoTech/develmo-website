// Loop, chain and conflict detection for redirect rules. Pure: the manager
// calls it with the database rows, the static next.config list and the
// registry of public routes.

import { normalizePath, RESERVED_PATH } from "./redirect-map";

export type RuleLike = { id?: string; source: string; destination: string; enabled: boolean };

export type RuleCheck = { errors: string[]; warnings: string[]; chain: string[] };

const MAX_HOPS = 10;

function relative(dest: string): string | null {
  return /^https?:\/\//i.test(dest) ? null : normalizePath(dest);
}

export function checkRedirectRule(
  candidate: RuleLike,
  existing: RuleLike[],
  staticRules: { source: string; destination: string }[],
  publicRoutes: string[],
): RuleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const source = normalizePath(candidate.source);
  const destRel = relative(candidate.destination);

  if (destRel !== null && destRel === source) errors.push("Source and destination are the same path");
  if (RESERVED_PATH.test(source)) errors.push("Rules for /admin, /api, robots.txt and the sitemap are not served: those paths are never redirected");
  const staticHit = staticRules.find((r) => normalizePath(r.source) === source);
  if (staticHit) errors.push(`${source} is already redirected to ${staticHit.destination} by next.config.ts, which runs first, so this rule would never be reached`);
  const dup = existing.find((r) => r.id !== candidate.id && normalizePath(r.source) === source);
  if (dup) errors.push(`A rule for ${source} already exists${dup.enabled ? "" : " (disabled)"}`);

  // Follow the destination through every rule that would apply to it.
  const table = new Map<string, string>();
  for (const r of staticRules) table.set(normalizePath(r.source), r.destination);
  for (const r of existing) if (r.enabled && r.id !== candidate.id) table.set(normalizePath(r.source), r.destination);
  if (candidate.enabled) table.set(source, candidate.destination);

  const chain: string[] = [source];
  let cursor = candidate.destination;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const rel = relative(cursor);
    chain.push(rel ?? cursor);
    if (rel === null) break;
    if (rel === source) {
      errors.push(`Loop: ${chain.join(" to ")}`);
      break;
    }
    const next = table.get(rel);
    if (!next) break;
    cursor = next;
    if (hop === MAX_HOPS - 1) errors.push("The redirect chain is longer than 10 hops");
  }
  if (errors.length === 0 && chain.length > 2) warnings.push(`Chain: ${chain.join(" to ")}. Point the source straight at ${chain[chain.length - 1]} to save a hop`);

  if (candidate.enabled && publicRoutes.includes(source)) warnings.push(`${source} is a live page; this rule hides it while enabled`);
  if (destRel !== null && !publicRoutes.includes(destRel) && !table.has(destRel) && !/^\/(our-blogs|our-knowledge-base|jobs|what-we-do|who-we-help|our-products)\//.test(destRel)) {
    warnings.push(`${destRel} is not a known public route; make sure it resolves`);
  }
  // Rules whose destination is the candidate's source now chain through it.
  const feeders = existing.filter((r) => r.enabled && r.id !== candidate.id && relative(r.destination) === source);
  if (feeders.length && candidate.enabled) warnings.push(`${feeders.length} existing rule${feeders.length === 1 ? "" : "s"} point${feeders.length === 1 ? "s" : ""} at ${source} and will now chain through this one: ${feeders.map((f) => f.source).join(", ")}`);
  return { errors, warnings, chain };
}
