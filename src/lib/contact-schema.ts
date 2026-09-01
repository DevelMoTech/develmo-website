import { z } from "zod";

// Email validated by regex to stay compatible across zod versions.
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().min(3).max(160).refine((v) => emailRe.test(v), "Enter a valid email address"),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(60).optional().default(""),
  service: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(10, "Please add a little detail (10+ characters)").max(4000),
  consent: z.boolean().refine((v) => v === true, "Please accept the consent to continue"),
});

export type ContactInput = z.infer<typeof contactSchema>;

// reCAPTCHA v3 action name. The form passes it to grecaptcha.execute and Google
// echoes it back to siteverify, so a token minted elsewhere fails verification.
// Lives here (not in lib/recaptcha.ts) so the client never pulls in server code.
export const RECAPTCHA_ACTION = "contact";
