import { z } from "zod";
import { locales } from "@/lib/i18n";
import { SLUG_MAX, SLUG_RE } from "@/lib/slug";

// Post editor payloads (brief §3.3), validated at the API boundary. Unit
// tested in tests/unit/post-schema.test.ts.

export const POST_TYPES = ["blog", "kb"] as const;
export const POST_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export const TRANSLATION_LOCALES = locales.filter((l) => l !== "en");
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(SLUG_MAX, `Use at most ${SLUG_MAX} characters`)
  .refine((v) => SLUG_RE.test(v), "Lowercase letters, numbers and single hyphens only");

const uuidOrNull = z.string().uuid().nullable().optional().transform((v) => v ?? null);

const emptyToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

// Canonical override: an absolute https URL or a site-relative path.
const canonicalSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v) || (v.startsWith("/") && !v.startsWith("//")), "Use an https URL or a path starting with /");

const tagSchema = z.string().trim().min(1).max(40);

export const tagsSchema = z
  .array(tagSchema)
  .max(20, "Use at most 20 tags")
  .transform((arr) => [...new Set(arr.map((t) => t.toLowerCase()))]);

const translationSchema = z.object({
  title: z.string().trim().max(200).optional().default(""),
  excerpt: z.string().trim().max(600).optional().default(""),
  bodyMd: z.string().max(200_000).optional().default(""),
});

export const translationsSchema = z
  .record(z.string(), translationSchema)
  .optional()
  .default({})
  .refine((rec) => Object.keys(rec).every((k) => (TRANSLATION_LOCALES as readonly string[]).includes(k)), "Unknown locale")
  .transform((rec) => rec as Partial<Record<TranslationLocale, z.infer<typeof translationSchema>>>);

// ISO datetime or null. Empty strings become null.
const dateSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Enter a valid date and time")
  .transform((v) => (v ? new Date(v) : null));

export const postFieldsSchema = z.object({
  type: z.enum(POST_TYPES),
  title: z.string().trim().min(1, "Title is required").max(200, "Use at most 200 characters"),
  slug: slugSchema,
  excerpt: z.string().trim().max(600, "Use at most 600 characters").optional().default(""),
  bodyMd: z.string().max(200_000, "The body is too long").optional().default(""),
  category: z.string().trim().max(80).optional().default(""),
  tags: tagsSchema.optional().default([]),
  authorName: z.string().trim().min(1, "Author is required").max(80).optional().default("DevelMo Team"),
  heroImageId: uuidOrNull,
  status: z.enum(POST_STATUSES),
  publishedAt: dateSchema,
  canonicalOverride: canonicalSchema,
  metaTitle: emptyToNull(200),
  metaDescription: emptyToNull(320),
  ogImageId: uuidOrNull,
  noindex: z.boolean().optional().default(false),
  translations: translationsSchema,
});

// A scheduled post needs a go-live time in the future; a published post
// without a time is published now.
function checkSchedule(v: z.infer<typeof postFieldsSchema>, ctx: z.RefinementCtx) {
  if (v.status === "scheduled") {
    if (!v.publishedAt) ctx.addIssue({ code: "custom", path: ["publishedAt"], message: "Choose when the post goes live" });
    else if (v.publishedAt.getTime() <= Date.now()) ctx.addIssue({ code: "custom", path: ["publishedAt"], message: "A scheduled time must be in the future" });
  }
}

export const postCreateSchema = postFieldsSchema.superRefine(checkSchedule);

export const postUpdateSchema = postFieldsSchema
  .extend({
    id: z.string().uuid(),
    // On a slug change, also write a 301 from the old address (default on).
    createRedirect: z.boolean().optional().default(true),
  })
  .superRefine(checkSchedule);

export type PostInput = z.infer<typeof postCreateSchema>;

export const postBulkSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1, "Select at least one post").max(200),
    action: z.enum(["publish", "unpublish", "archive", "delete", "retag"]),
    addTags: tagsSchema.optional().default([]),
    removeTags: tagsSchema.optional().default([]),
  })
  .refine((v) => v.action !== "retag" || v.addTags.length > 0 || v.removeTags.length > 0, {
    path: ["addTags"],
    message: "Add or remove at least one tag",
  });

export const postRestoreSchema = z.object({
  postId: z.string().uuid(),
  revisionId: z.string().uuid(),
});

export const postDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const markdownRenderSchema = z.object({
  markdown: z.string().max(200_000),
});
