import { z } from "zod";
import { ROLES } from "@/lib/auth/rbac";

// The public "request access" form and the decision the console makes on it.
// Client-safe: no server imports, so the form component can share the rules
// the API enforces.

// reCAPTCHA v3 action for this form. The verifier checks the action name
// carried by the token, so the form and the route have to name it from one
// place or every submission is rejected.
export const ACCESS_REQUEST_RECAPTCHA_ACTION = "access_request";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const accessRequestSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(160)
    .refine((v) => emailRe.test(v), "Enter a valid email address"),
  organisation: z.string().trim().max(120).optional().default(""),
  // Required: an approver needs something to decide on.
  reason: z.string().trim().min(10, "Say what you need access for").max(2000),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

// Approving mints the same single-use invite the console sends by hand, so a
// role has to be chosen at that moment. Declining never sends email.
export const accessDecisionSchema = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "decline"]),
    role: z.enum(ROLES).optional(),
    note: z.string().trim().max(500).optional().default(""),
  })
  .refine((v) => v.decision !== "approve" || v.role !== undefined, {
    path: ["role"],
    message: "Choose the role to invite them as",
  });
export type AccessDecisionInput = z.infer<typeof accessDecisionSchema>;

// Who is told when a request arrives. One address, editable in the console;
// the default is the same address the contact form delivers to.
export const accessNotifySchema = z.object({
  notifyEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(160)
    .refine((v) => emailRe.test(v), "Enter a valid email address"),
});
export type AccessNotifyInput = z.infer<typeof accessNotifySchema>;

export const accessRequestIdSchema = z.object({ id: z.string().uuid() });
