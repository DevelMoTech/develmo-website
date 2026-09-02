import { getDb } from "@/db";
import { auditLog, securityEvents } from "@/db/schema";

// Append-only audit log (brief §7.6, §3.11). This module only inserts; no
// update or delete path for audit rows exists anywhere in the codebase.
export async function audit(entry: {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
}): Promise<void> {
  try {
    await getDb().insert(auditLog).values({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ipHash: entry.ipHash ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write audit row", entry.action, err);
  }
}

export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_locked"
  | "logout"
  | "rate_limited"
  | "mfa_failed"
  | "mfa_success"
  | "mfa_enrolled"
  | "mfa_reset"
  | "recovery_code_used"
  | "session_revoked"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset"
  | "invite_redeemed"
  | "invite_rejected"
  | "email_change_requested"
  | "email_changed"
  | "permission_denied"
  | "csrf_rejected"
  | "honeypot"
  | "captcha_rejected"
  | "upload_rejected"
  | "account_locked"
  | "account_unlocked";

export async function securityEvent(entry: {
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  ipHash?: string | null;
  path?: string | null;
  userAgent?: string | null;
  meta?: unknown;
}): Promise<void> {
  try {
    await getDb().insert(securityEvents).values({
      type: entry.type,
      userId: entry.userId ?? null,
      email: entry.email ?? null,
      ipHash: entry.ipHash ?? null,
      path: entry.path ?? null,
      userAgent: entry.userAgent?.slice(0, 512) ?? null,
      meta: entry.meta ?? null,
    });
  } catch (err) {
    console.error("[security] failed to write event", entry.type, err);
  }
}
