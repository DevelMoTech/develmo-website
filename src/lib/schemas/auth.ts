import { z } from "zod";
import { ROLES } from "@/lib/auth/rbac";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(160)
  .refine((v) => emailRe.test(v), "Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "Use at most 200 characters");

// A post-login destination must be a same-site path under /admin.
export const nextPathSchema = z
  .string()
  .max(512)
  .refine((v) => v.startsWith("/admin") && !v.startsWith("//") && !v.includes("\\"), "Invalid path")
  .catch("/admin");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  next: nextPathSchema.optional(),
});

export const signupSchema = z.object({
  token: z.string().min(20).max(2048),
  name: z.string().trim().min(1, "Name is required").max(120),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(2048),
  password: passwordSchema,
});

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6 digit code");

export const mfaVerifySchema = z.object({
  // Either a 6 digit TOTP code or a recovery code (XXXXX-XXXXX).
  code: z.string().trim().min(6).max(16),
  next: nextPathSchema.optional(),
});

export const mfaEnrolConfirmSchema = z.object({
  code: totpCodeSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES),
});

export const inviteIdSchema = z.object({
  inviteId: z.string().uuid(),
});

export const changeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

export const userStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "deactivated"]),
});

export const deleteUserSchema = z.object({
  userId: z.string().uuid(),
  // Typed confirmation: the user's email.
  confirm: z.string().trim().toLowerCase().max(160),
});

export const tokenQuerySchema = z.string().min(20).max(2048);
