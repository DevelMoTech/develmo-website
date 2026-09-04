// The IP access rule set the proxy serves from memory (brief §3.7). No
// server imports, so it is bundled into src/proxy.ts and unit tested.

import { ipInCidr, parseCidr, parseIp, type ParsedCidr } from "./cidr";

export type AccessAction = "block" | "allow";

export type AccessRule = {
  id: string;
  cidr: string;
  action: AccessAction;
  reason: string;
  // ISO timestamp, or null for a rule that never expires.
  expiresAt: string | null;
};

export type AccessRuleSet = {
  rules: AccessRule[];
  generatedAt: string;
};

export const EMPTY_RULE_SET: AccessRuleSet = { rules: [], generatedAt: new Date(0).toISOString() };

// How long the proxy serves a rule set before refreshing it in the
// background. Shorter than the redirect TTL: a block should take hold
// quickly, and an unblock even more so.
export const ACCESS_TTL_MS = 5_000;

// Cache tag for the rule set; busted on every save.
export const ACCESS_TAG = "ip-rules";

export type AccessDecision =
  | { allowed: true; rule: AccessRule | null }
  | { allowed: false; rule: AccessRule };

// Allow wins over block, so an allow rule is the way out of an over-broad
// block. An expired rule is ignored. Among blocks the most specific match
// is reported, which is the one worth showing in the log.
export function evaluateAccess(set: AccessRuleSet | null, ip: string, now = new Date()): AccessDecision {
  if (!set || set.rules.length === 0) return { allowed: true, rule: null };
  const address = parseIp(ip);
  if (!address) return { allowed: true, rule: null };

  let block: { rule: AccessRule; cidr: ParsedCidr } | null = null;
  for (const rule of set.rules) {
    if (rule.expiresAt && new Date(rule.expiresAt) <= now) continue;
    const cidr = parseCidr(rule.cidr);
    if (!cidr || !ipInCidr(address, cidr)) continue;
    if (rule.action === "allow") return { allowed: true, rule };
    if (!block || cidr.prefix > block.cidr.prefix) block = { rule, cidr };
  }
  return block ? { allowed: false, rule: block.rule } : { allowed: true, rule: null };
}

// The plain-text body a blocked visitor receives. No markup, no styling, and
// no detail about the rule: it states the fact and how to get in touch.
export const BLOCKED_BODY = "403 Forbidden\n\nThis address cannot access this site.\nIf you think this is a mistake, email info@develmo.com.\n";
