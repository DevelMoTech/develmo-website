import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

// Key-value settings: site facts overrides, contact recipients, retention
// windows, feature toggles, media/hero settings, navigation structure, robots
// config. One jsonb document per key, zod-validated per key before write.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  key: text("key").primaryKey(),
  subject: text("subject").notNull(),
  bodyMd: text("body_md").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only. No update or delete path exists in application code, for any role.
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    // Kept as text so rows survive actor deletion.
    actorEmail: text("actor_email"),
    // e.g. post.publish, user.role_change, redirect.create
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.createdAt),
    index("audit_log_actor_id_idx").on(t.actorId),
  ],
);
