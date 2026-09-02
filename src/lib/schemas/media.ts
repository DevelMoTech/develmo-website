import { z } from "zod";
import { tagsSchema } from "./post";

// Media library payloads (brief §3.10). Uploads are multipart and validated
// in the route from bytes; these cover the JSON mutations and list queries.

export const folderSchema = z
  .string()
  .trim()
  .max(120)
  .transform((v) => v.replace(/^\/+|\/+$/g, "").toLowerCase())
  .refine((v) => v === "" || /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(v), "Use lowercase letters, numbers and hyphens, with / between folders");

export const altTextSchema = z.string().trim().max(300, "Use at most 300 characters");

export const mediaUpdateSchema = z.object({
  id: z.string().uuid(),
  altText: altTextSchema,
  folder: folderSchema.optional().default(""),
  tags: tagsSchema.optional().default([]),
  filename: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine((v) => !/[\\/]/.test(v), "A file name cannot contain slashes"),
});

export const mediaDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const mediaIdSchema = z.object({
  id: z.string().uuid(),
});

export const mediaListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  folder: z.string().trim().max(120).optional().default(""),
  tag: z.string().trim().max(40).optional().default(""),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  // The post editor only offers images that already carry alt text.
  withAlt: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});
