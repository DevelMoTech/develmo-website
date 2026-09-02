import { z } from "zod";
import { tagsSchema } from "./post";

// Submissions inbox payloads (brief §3.5). This module stays free of server
// imports so client components can share the enumerations.

export const DIGEST_MODES = ["off", "instant", "daily"] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

export const SUBMISSION_STATUSES = ["new", "read", "in_progress", "qualified", "won", "lost", "spam"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const SUBMISSION_KINDS = ["contact", "application", "newsletter"] as const;

export const submissionUpdateSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(SUBMISSION_STATUSES).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    tags: tagsSchema.optional(),
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined || v.tags !== undefined, { message: "Nothing to change" });

export const submissionNoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1, "Write a note").max(4000),
  parentId: z.string().uuid().nullable().optional(),
});

export const submissionSpamSchema = z.object({
  id: z.string().uuid(),
  spam: z.boolean(),
});

export const submissionIdSchema = z.object({
  id: z.string().uuid(),
});

export const digestSchema = z.object({
  digest: z.enum(DIGEST_MODES),
});
