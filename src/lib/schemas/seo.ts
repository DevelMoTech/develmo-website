import { z } from "zod";

// Client-safe zod schemas for the SEO manager (no server imports).

export const CHANGEFREQS = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] as const;
export type Changefreq = (typeof CHANGEFREQS)[number];

export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 155;

const pathField = z
  .string()
  .trim()
  .min(1, "Path is required")
  .max(300)
  .regex(/^\/[^\s?#]*$/, "Must be a path starting with /, without query or fragment");

// A canonical or redirect destination: a site path or an absolute http(s) URL.
const pathOrUrl = z
  .string()
  .trim()
  .max(2000)
  .regex(/^(\/[^\s]*|https?:\/\/[^\s]+)$/i, "Must be a path starting with / or an absolute URL");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional();

export const overrideSchema = z.object({
  path: pathField,
  metaTitle: optionalText(150),
  metaDescription: optionalText(400),
  canonical: z
    .union([pathOrUrl, z.literal("")])
    .transform((v) => (v ? v : null))
    .nullable()
    .optional(),
  ogImageId: z.string().uuid().nullable().optional(),
  noindex: z.boolean().nullable().optional(),
  nofollow: z.boolean().nullable().optional(),
  sitemapInclude: z.boolean().nullable().optional(),
  sitemapChangefreq: z.enum(CHANGEFREQS).nullable().optional(),
  sitemapPriority: z.number().min(0).max(1).nullable().optional(),
  faqEnabled: z.boolean().nullable().optional(),
});
export type OverrideInput = z.infer<typeof overrideSchema>;

export const pathSchema = z.object({ path: pathField });

export const sitemapFieldsSchema = z.object({
  path: pathField,
  sitemapInclude: z.boolean().nullable(),
  sitemapChangefreq: z.enum(CHANGEFREQS).nullable(),
  sitemapPriority: z.number().min(0).max(1).nullable(),
});
export type SitemapFieldsInput = z.infer<typeof sitemapFieldsSchema>;

export const redirectSchema = z.object({
  id: z.string().uuid().optional(),
  source: pathField,
  destination: pathOrUrl,
  code: z.union([z.literal(301), z.literal(302)]),
  enabled: z.boolean(),
  note: z.string().trim().max(300).default(""),
});
export type RedirectInput = z.infer<typeof redirectSchema>;

export const idSchema = z.object({ id: z.string().uuid() });

export const robotsBodySchema = z.object({ body: z.string().max(20_000) });

export const organizationFactsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
  description: z.string().trim().min(1, "Description is required").max(5000),
  streetAddress: z.string().trim().min(1, "Street address is required").max(200),
  addressLocality: z.string().trim().min(1, "City is required").max(100),
  postalCode: z.string().trim().min(1, "Postcode is required").max(20),
  addressCountry: z.string().trim().min(1, "Country is required").max(56),
  telephone: z.array(z.string().trim().max(25)).max(10).default([]),
  logo: z.union([z.string().trim().url().max(500), z.literal("")]).default(""),
});
export type OrganizationFactsInput = z.infer<typeof organizationFactsSchema>;

export const auditIdSchema = z.object({ id: z.string().uuid() });
