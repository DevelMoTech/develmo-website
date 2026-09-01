import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.ts";

export const jobStatus = pgEnum("job_status", ["draft", "open", "paused", "closed"]);
export const applicationStage = pgEnum("application_stage", [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    department: text("department").notNull().default(""),
    location: text("location").notNull().default(""),
    // One of the office codes in src/lib/site.ts: UK, AU, SA, PK.
    officeCode: text("office_code"),
    employmentType: text("employment_type").notNull().default("full-time"),
    seniority: text("seniority").notNull().default(""),
    remotePolicy: text("remote_policy").notNull().default(""),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency").notNull().default("GBP"),
    hideSalary: boolean("hide_salary").notNull().default(false),
    summaryMd: text("summary_md").notNull().default(""),
    responsibilitiesMd: text("responsibilities_md").notNull().default(""),
    requirementsMd: text("requirements_md").notNull().default(""),
    benefitsMd: text("benefits_md").notNull().default(""),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    status: jobStatus("status").notNull().default("draft"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    noindex: boolean("noindex").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_status_idx").on(t.status)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Restrict: a job with applications must transfer or clear them explicitly.
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    location: text("location").notNull().default(""),
    linkedinUrl: text("linkedin_url").notNull().default(""),
    portfolioUrl: text("portfolio_url").notNull().default(""),
    coverNote: text("cover_note").notNull().default(""),
    // CV lives in the storage backend under an unguessable key, served via
    // short-lived signed URLs only.
    cvBlobKey: text("cv_blob_key"),
    cvFilename: text("cv_filename"),
    cvContentType: text("cv_content_type"),
    cvSize: integer("cv_size"),
    stage: applicationStage("stage").notNull().default("new"),
    // 1-5, null = unrated.
    rating: integer("rating"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("applications_job_id_idx").on(t.jobId), index("applications_stage_idx").on(t.stage)],
);

export const applicationNotes = pgTable(
  "application_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_notes_application_id_idx").on(t.applicationId)],
);

// Stage-change audit trail for the applicant pipeline.
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    fromStage: applicationStage("from_stage"),
    toStage: applicationStage("to_stage").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_application_id_idx").on(t.applicationId)],
);
