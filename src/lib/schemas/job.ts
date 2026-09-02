import { z } from "zod";
import { CURRENCIES, EMPLOYMENT_TYPES, JOB_STATUSES, OFFICES, REMOTE_POLICIES, SALARY_PERIODS, SENIORITIES } from "@/lib/jobs-shared";
import { locales } from "@/lib/i18n";
import { slugSchema } from "./post";

// Job board payloads (brief §3.4), validated at every boundary.

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const emptyToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const dateSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Enter a valid date and time")
  .transform((v) => (v ? new Date(v) : null));

const moneySchema = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100_000_000), "Enter a whole amount");

const canonicalSchema = emptyToNull(500).refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v) || (v.startsWith("/") && !v.startsWith("//")), "Use an https URL or a path starting with /");

export const jobFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(160, "Use at most 160 characters"),
    slug: slugSchema,
    department: z.string().trim().max(80).optional().default(""),
    location: z.string().trim().max(120).optional().default(""),
    officeCode: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || OFFICES.some((o) => o.code === v), "Choose one of the offices"),
    employmentType: z.enum(EMPLOYMENT_TYPES.map((e) => e.value) as [string, ...string[]]),
    seniority: z.enum(SENIORITIES.map((s) => s.value) as [string, ...string[]]).optional().default(""),
    remotePolicy: z.enum(REMOTE_POLICIES.map((r) => r.value) as [string, ...string[]]),
    salaryMin: moneySchema,
    salaryMax: moneySchema,
    salaryCurrency: z.enum(CURRENCIES),
    salaryPeriod: z.enum(SALARY_PERIODS.map((p) => p.value) as [string, ...string[]]).optional().default("year"),
    hideSalary: z.boolean().optional().default(false),
    summaryMd: z.string().max(20_000).optional().default(""),
    responsibilitiesMd: z.string().max(50_000).optional().default(""),
    requirementsMd: z.string().max(50_000).optional().default(""),
    benefitsMd: z.string().max(50_000).optional().default(""),
    opensAt: dateSchema,
    closesAt: dateSchema,
    status: z.enum(JOB_STATUSES),
    metaTitle: emptyToNull(200),
    metaDescription: emptyToNull(320),
    canonicalOverride: canonicalSchema,
    noindex: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.salaryMin !== null && v.salaryMax !== null && v.salaryMax < v.salaryMin) ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "The maximum must not be below the minimum" });
    if (v.opensAt && v.closesAt && v.closesAt.getTime() <= v.opensAt.getTime()) ctx.addIssue({ code: "custom", path: ["closesAt"], message: "The closing date must be after the opening date" });
  });

export type JobInput = z.infer<typeof jobFieldsSchema>;

export const jobCreateSchema = jobFieldsSchema;
export const jobUpdateSchema = jobFieldsSchema.safeExtend({ id: z.string().uuid() });
export const jobDeleteSchema = z.object({ id: z.string().uuid() });

// The public application form. `company_url` is the honeypot and is read
// before validation; consent must be explicit.
export const applicationSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().min(3).max(160).refine((v) => emailRe.test(v), "Enter a valid email address"),
  phone: z.string().trim().max(40).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\/.+/i.test(v), "Enter a LinkedIn profile link (https://www.linkedin.com/in/...)"),
  portfolioUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Enter an https link"),
  coverNote: z.string().trim().max(4000, "Keep the note under 4000 characters").optional().default(""),
  consent: z.boolean().refine((v) => v === true, "Please accept the consent to continue"),
  locale: z.enum(locales).optional().default("en"),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// reCAPTCHA v3 action for the application form (the contact form uses "contact").
export const APPLY_RECAPTCHA_ACTION = "apply";

export const STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"] as const;

export const applicationStageSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGES),
  note: z.string().trim().max(2000).optional().default(""),
});

export const applicationRatingSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int().min(1).max(5).nullable(),
});

export const applicationAssignSchema = z.object({
  id: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});

export const applicationNoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1, "Write a note").max(4000),
});

export const applicationDeleteSchema = z.object({
  id: z.string().uuid(),
});

const templateSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(10_000),
});

export const applicationRejectSchema = z.object({
  id: z.string().uuid(),
  subject: templateSchema.shape.subject,
  body: templateSchema.shape.body,
  saveAsTemplate: z.boolean().optional().default(false),
});

export const emailTemplatesSchema = z.object({
  application_ack: templateSchema,
  application_rejection: templateSchema,
});
