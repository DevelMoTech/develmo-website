import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.ts";
import { applications } from "./jobs.ts";

export const submissionKind = pgEnum("submission_kind", ["contact", "application", "newsletter"]);
export const submissionStatus = pgEnum("submission_status", [
  "new",
  "read",
  "in_progress",
  "qualified",
  "won",
  "lost",
  "spam",
]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sent", "failed", "skipped"]);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: submissionKind("kind").notNull(),
    status: submissionStatus("status").notNull().default("new"),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    company: text("company").notNull().default(""),
    message: text("message").notNull().default(""),
    // Qualifiers the contact form already reads from the URL.
    service: text("service").notNull().default(""),
    industry: text("industry").notNull().default(""),
    intent: text("intent").notNull().default(""),
    budget: text("budget").notNull().default(""),
    referrer: text("referrer").notNull().default(""),
    landingPage: text("landing_page").notNull().default(""),
    utm: jsonb("utm"),
    locale: text("locale"),
    userAgent: text("user_agent"),
    // Salted hash, never the raw IP. Stored for abuse prevention.
    ipHash: text("ip_hash"),
    isSpam: boolean("is_spam").notNull().default(false),
    // honeypot | captcha, for the spam view.
    spamReason: text("spam_reason"),
    deliveryStatus: deliveryStatus("delivery_status").notNull().default("pending"),
    deliveryError: text("delivery_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default([]),
    // Cross-link for kind=application rows.
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("submissions_status_idx").on(t.status),
    index("submissions_kind_idx").on(t.kind),
    index("submissions_created_at_idx").on(t.createdAt),
  ],
);

export const submissionNotes = pgTable(
  "submission_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submission_notes_submission_id_idx").on(t.submissionId)],
);
