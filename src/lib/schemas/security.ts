import { z } from "zod";
import { parseCidr } from "@/lib/security/cidr";
import { PERMISSIONS, can, type Permission } from "@/lib/auth/rbac";

// Client-safe zod schemas for the security manager (no server imports).

export const ACCESS_ACTIONS = ["block", "allow"] as const;

export const SECURITY_EVENT_TYPES = [
  "login_success",
  "login_failed",
  "login_locked",
  "logout",
  "rate_limited",
  "mfa_failed",
  "mfa_success",
  "mfa_enrolled",
  "mfa_reset",
  "recovery_code_used",
  "session_revoked",
  "password_changed",
  "password_reset_requested",
  "password_reset",
  "invite_redeemed",
  "invite_rejected",
  "email_change_requested",
  "email_changed",
  "permission_denied",
  "csrf_rejected",
  "honeypot",
  "captcha_rejected",
  "upload_rejected",
  "account_locked",
  "account_unlocked",
  "ip_blocked",
] as const;
export type SecurityEventTypeName = (typeof SECURITY_EVENT_TYPES)[number];

const cidrField = z
  .string()
  .trim()
  .min(1, "Enter an IP address or a CIDR range")
  .max(64)
  .refine((v) => parseCidr(v) !== null, "Not a valid IP address or CIDR range");

export const accessRuleSchema = z.object({
  id: z.string().uuid().optional(),
  cidr: cidrField,
  action: z.enum(ACCESS_ACTIONS),
  reason: z.string().trim().max(300).default(""),
  // ISO date (YYYY-MM-DD) or empty for a rule that never expires.
  expiresAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker"), z.literal("")]).default(""),
  // The typed confirmation required to block a range covering your own IP.
  confirm: z.string().trim().max(64).default(""),
});
export type AccessRuleInput = z.infer<typeof accessRuleSchema>;

export const idSchema = z.object({ id: z.string().uuid() });

// Endpoints whose limits the console can change. The other limiters keep
// their code defaults, which the UI states.
export const EDITABLE_LIMITS = ["contact", "apply", "login", "reset"] as const;
export type EditableLimit = (typeof EDITABLE_LIMITS)[number];

export const rateLimitSchema = z.object({
  key: z.enum(EDITABLE_LIMITS),
  maxRequests: z.number().int().min(1, "At least one request").max(10_000),
  windowSeconds: z.number().int().min(10, "At least ten seconds").max(86_400),
});
export type RateLimitInput = z.infer<typeof rateLimitSchema>;

export const turnstileSchema = z.object({
  enabled: z.boolean(),
  // Cloudflare site keys are public by design; the secret stays in the env.
  siteKey: z.union([z.string().trim().max(120).regex(/^[A-Za-z0-9_-]+$/, "Site keys are letters, digits, hyphens and underscores"), z.literal("")]).default(""),
});
export type TurnstileInput = z.infer<typeof turnstileSchema>;
export const DEFAULT_TURNSTILE: TurnstileInput = { enabled: false, siteKey: "" };

// The second-factor policy (Security, Authentication). "off": nobody is
// asked, enrolments are kept. "optional": whoever set one up is asked, nobody
// is made to. "admins": Owner and Admin must set one up (the brief's rule).
// "everyone": every account must.
export const MFA_POLICIES = ["off", "optional", "admins", "everyone"] as const;
export type MfaPolicy = (typeof MFA_POLICIES)[number];
export const mfaPolicySchema = z.object({ mfa: z.enum(MFA_POLICIES) });
export type MfaPolicyInput = z.infer<typeof mfaPolicySchema>;
export const DEFAULT_MFA_POLICY: MfaPolicyInput = { mfa: "optional" };

// Which console features each role may use (Security, Roles and access).
// Owner is absent on purpose: it always holds everything, so a mistake in the
// grid is always undoable. The shipped matrix in rbac.ts is the default.
// Unknown names are dropped rather than rejected. A permission that is
// renamed or retired in the code would otherwise make the whole saved grid
// fail to parse, and every role would silently revert to the shipped matrix.
const permissionList = z
  .array(z.string())
  .transform((list) => list.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)));

export const roleAccessSchema = z.object({
  roles: z.object({ admin: permissionList, editor: permissionList, viewer: permissionList }),
  // Which permissions the grid covered when it was saved. A permission added
  // to the console afterwards is not in this list, so it keeps the answer the
  // console ships with instead of counting as unticked.
  known: permissionList.default([...PERMISSIONS]),
});
export type RoleAccess = z.infer<typeof roleAccessSchema>;

// Never grantable to anyone but the Owner: the owner only settings and
// transferring ownership. A tick box must not become a way around that.
export const OWNER_ONLY_PERMISSIONS: Permission[] = ["settings:owner", "owner:manage"];

// Held for Admin whatever the grid says. Without these an Admin could untick
// their own way out of Users and Security and then have no way back in.
export const ADMIN_FLOOR_PERMISSIONS: Permission[] = ["users:read", "users:manage", "security:read", "security:write", "settings:read", "settings:write"];

// Not handed to an Editor or a Viewer by a tick box. Each of these makes the
// holder an administrator in all but name, and promoting somebody is what the
// role field is for; doing it through this grid would hide it.
export const ADMIN_ONLY_PERMISSIONS: Permission[] = ["users:manage", "security:write", "settings:write"];
export const DEFAULT_ROLE_ACCESS: RoleAccess = {
  roles: {
    admin: PERMISSIONS.filter((p) => can("admin", p)),
    editor: PERMISSIONS.filter((p) => can("editor", p)),
    viewer: PERMISSIONS.filter((p) => can("viewer", p)),
  },
  known: [...PERMISSIONS],
};

export const securityRetentionSchema = z.object({
  // Days to keep security events before the cron deletes them. 0 keeps them
  // forever; the audit log is separate and is never deleted.
  eventDays: z.number().int().min(0).max(3650),
});
export type SecurityRetention = z.infer<typeof securityRetentionSchema>;
export const DEFAULT_SECURITY_RETENTION: SecurityRetention = { eventDays: 180 };

export const sessionRevokeSchema = z.object({ sessionId: z.string().uuid() });

export const userActionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["logout_all", "force_password_reset", "force_mfa_reenrol", "lock", "unlock"]),
});
export type UserActionInput = z.infer<typeof userActionSchema>;

export const headersCheckSchema = z.object({
  path: z.string().trim().max(300).regex(/^\/[^\s?#]*$/, "A path starting with /"),
});
