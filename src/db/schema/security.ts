import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

export const ipRuleAction = pgEnum("ip_rule_action", ["block", "allow"]);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // login_failed | login_success | rate_limited | honeypot | captcha_rejected |
    // permission_denied | session_revoked | upload_rejected | account_locked | ...
    type: text("type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    ipHash: text("ip_hash"),
    path: text("path"),
    userAgent: text("user_agent"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("security_events_type_idx").on(t.type),
    index("security_events_created_at_idx").on(t.createdAt),
  ],
);

// IP / CIDR blocklist and allowlist enforced in src/proxy.ts.
export const ipRules = pgTable("ip_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  cidr: text("cidr").notNull(),
  action: ipRuleAction("action").notNull(),
  reason: text("reason").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Runtime-editable per-endpoint rate limits (contact, apply, login, reset, ...).
export const rateLimitConfig = pgTable("rate_limit_config", {
  key: text("key").primaryKey(),
  windowSeconds: integer("window_seconds").notNull(),
  maxRequests: integer("max_requests").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dependencyAudits = pgTable("dependency_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  // Severity counts, e.g. { critical: 0, high: 1, moderate: 3, low: 2 }.
  summary: jsonb("summary").notNull(),
  advisories: jsonb("advisories"),
});
