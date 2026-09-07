import { and, asc, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authTokens, invites, recoveryCodes, sessions, users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { consumeLimit, peekLimit, retryAfterSeconds } from "@/lib/ratelimit";
import { audit, securityEvent } from "./log";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";
import { canChangeRole, canRemoveUser, invitableRoles, mfaRequired, type Role } from "./rbac";
import {
  createSession,
  revokeAllSessions,
  revokeOtherSessions,
  rotateSessionToken,
  type SessionWithUser,
  type UserRow,
} from "./session";
import { randomToken, safeEqual, sha256Hex, signToken, verifySignedToken } from "./tokens";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  newTotpSecret,
  totpQrDataUrl,
  totpUri,
  verifyTotp,
} from "./totp";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

export type Ctx = { ipHash: string; userAgent: string | null };

export type Actor = Pick<UserRow, "id" | "email" | "role">;

function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export type LoginResult =
  | {
      ok: true;
      token: string;
      expires: Date;
      mfaPending: boolean;
      mustChangePassword: boolean;
      needsMfaEnrolment: boolean;
    }
  | { ok: false; code: "invalid" }
  | { ok: false; code: "rate_limited"; retryAfter: number };

export async function login(
  input: { email: string; password: string; ip: string },
  ctx: Ctx,
): Promise<LoginResult> {
  const ipLimit = await peekLimit("login", input.ip);
  const accountLimit = await peekLimit("login_account", input.email);
  if (ipLimit.limited || accountLimit.limited) {
    const r = ipLimit.limited ? ipLimit : accountLimit;
    await securityEvent({ type: "rate_limited", email: input.email, ipHash: ctx.ipHash, path: "/admin/login", userAgent: ctx.userAgent });
    return { ok: false, code: "rate_limited", retryAfter: retryAfterSeconds(r) };
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Always run the hash verification so unknown accounts cost the same time.
  const hash = user?.passwordHash ?? (await dummyPasswordHash());
  const valid = await verifyPassword(hash, input.password);

  if (!user || !valid || user.status !== "active") {
    await consumeLimit("login", input.ip);
    await consumeLimit("login_account", input.email);
    await securityEvent({
      type: user && valid ? "login_locked" : "login_failed",
      userId: user?.id ?? null,
      email: input.email,
      ipHash: ctx.ipHash,
      path: "/admin/login",
      userAgent: ctx.userAgent,
    });
    return { ok: false, code: "invalid" };
  }

  const mfaPending = user.totpEnabled;
  const s = await createSession({ userId: user.id, ipHash: ctx.ipHash, userAgent: ctx.userAgent, mfaPending });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await securityEvent({ type: "login_success", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/login", userAgent: ctx.userAgent, meta: { mfaPending } });
  return {
    ok: true,
    token: s.token,
    expires: s.absoluteExpiresAt,
    mfaPending,
    mustChangePassword: user.mustChangePassword,
    needsMfaEnrolment: mfaRequired(user.role) && !user.totpEnabled,
  };
}

export async function logout(auth: SessionWithUser, ctx: Ctx): Promise<void> {
  await getDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, auth.session.id));
  await securityEvent({ type: "logout", userId: auth.user.id, email: auth.user.email, ipHash: ctx.ipHash, userAgent: ctx.userAgent });
}

// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------

export type MfaResult =
  | { ok: true; token: string }
  | { ok: false; code: "invalid" }
  | { ok: false; code: "rate_limited"; retryAfter: number };

export async function verifyMfa(auth: SessionWithUser, code: string, ip: string, ctx: Ctx): Promise<MfaResult> {
  const { user, session } = auth;
  const ipLimit = await peekLimit("mfa", ip);
  const userLimit = await peekLimit("mfa", `user:${user.id}`);
  if (ipLimit.limited || userLimit.limited) {
    await securityEvent({ type: "rate_limited", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/mfa/verify", userAgent: ctx.userAgent });
    return { ok: false, code: "rate_limited", retryAfter: retryAfterSeconds(ipLimit.limited ? ipLimit : userLimit) };
  }
  const db = getDb();
  let passed = false;
  let usedRecovery = false;

  if (/^\d{6}$/.test(code) && user.totpSecretEnc && user.totpEnabled) {
    const result = await verifyTotp(decryptSecret(user.totpSecretEnc), code, user.totpLastStep);
    if (result.valid) {
      passed = true;
      await db.update(users).set({ totpLastStep: result.step }).where(eq(users.id, user.id));
    }
  } else if (code.length >= 8) {
    const target = hashRecoveryCode(code);
    const rows = await db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)));
    // Compare every row so the time taken does not depend on which code matched.
    let matchId: string | null = null;
    for (const r of rows) {
      if (safeEqual(r.codeHash, target)) matchId = r.id;
    }
    if (matchId) {
      const res = await db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(recoveryCodes.id, matchId), isNull(recoveryCodes.usedAt)));
      if ((res.rowCount ?? 0) > 0) {
        passed = true;
        usedRecovery = true;
      }
    }
  }

  if (!passed) {
    await consumeLimit("mfa", ip);
    await consumeLimit("mfa", `user:${user.id}`);
    await securityEvent({ type: "mfa_failed", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/mfa/verify", userAgent: ctx.userAgent });
    return { ok: false, code: "invalid" };
  }

  // Privilege change: the session becomes fully authenticated, so rotate.
  const token = await rotateSessionToken(session.id, { mfaPending: false });
  await securityEvent({
    type: usedRecovery ? "recovery_code_used" : "mfa_success",
    userId: user.id,
    email: user.email,
    ipHash: ctx.ipHash,
    path: "/admin/mfa/verify",
    userAgent: ctx.userAgent,
  });
  return { ok: true, token };
}

// Starts (or restarts) enrolment: a fresh secret is stored encrypted with
// totpEnabled=false until the user confirms a code from their app.
export async function beginTotpEnrolment(user: UserRow): Promise<{ secret: string; uri: string; qr: string }> {
  const secret = newTotpSecret();
  await getDb()
    .update(users)
    .set({ totpSecretEnc: encryptSecret(secret), totpEnabled: false, totpLastStep: null })
    .where(eq(users.id, user.id));
  const uri = totpUri(user.email, secret);
  return { secret, uri, qr: await totpQrDataUrl(uri) };
}

export type EnrolResult =
  | { ok: true; token: string; recoveryCodes: string[] }
  | { ok: false; code: "invalid" | "not_started" };

export async function confirmTotpEnrolment(auth: SessionWithUser, code: string, ctx: Ctx): Promise<EnrolResult> {
  const { user, session } = auth;
  if (!user.totpSecretEnc || user.totpEnabled) return { ok: false, code: "not_started" };
  const result = await verifyTotp(decryptSecret(user.totpSecretEnc), code, null);
  if (!result.valid) {
    await securityEvent({ type: "mfa_failed", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/mfa/enrol", userAgent: ctx.userAgent });
    return { ok: false, code: "invalid" };
  }
  const db = getDb();
  const codes = generateRecoveryCodes();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabled: true, totpLastStep: result.step }).where(eq(users.id, user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
    await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })));
  });
  await revokeOtherSessions(user.id, session.id);
  const token = await rotateSessionToken(session.id, { mfaPending: false });
  await audit({ actorId: user.id, actorEmail: user.email, action: "mfa.enrol", entityType: "user", entityId: user.id, ipHash: ctx.ipHash });
  await securityEvent({ type: "mfa_enrolled", userId: user.id, email: user.email, ipHash: ctx.ipHash, userAgent: ctx.userAgent });
  return { ok: true, token, recoveryCodes: codes };
}

// Disables TOTP after password re-authentication; the page gate then forces a
// fresh enrolment for roles that require it.
export async function resetOwnMfa(auth: SessionWithUser, currentPassword: string, ctx: Ctx): Promise<{ ok: boolean }> {
  const { user } = auth;
  if (!(await verifyPassword(user.passwordHash, currentPassword))) return { ok: false };
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null }).where(eq(users.id, user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
  });
  await audit({ actorId: user.id, actorEmail: user.email, action: "mfa.reset", entityType: "user", entityId: user.id, ipHash: ctx.ipHash });
  await securityEvent({ type: "mfa_reset", userId: user.id, email: user.email, ipHash: ctx.ipHash, userAgent: ctx.userAgent });
  return { ok: true };
}

export async function recoveryCodesRemaining(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export async function createInvite(
  actor: Actor,
  input: { email: string; role: Role; baseUrl: string },
  ctx: Ctx,
): Promise<{ ok: true; inviteId: string; url: string; expiresAt: Date; emailed: boolean } | { ok: false; code: "forbidden" | "exists" }> {
  if (!invitableRoles(actor.role).includes(input.role)) return { ok: false, code: "forbidden" };
  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) return { ok: false, code: "exists" };

  // Any earlier open invite for the address is superseded.
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.email, input.email), isNull(invites.usedAt), isNull(invites.revokedAt)));

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [row] = await db
    .insert(invites)
    .values({ email: input.email, role: input.role, tokenHash: randomToken(16), invitedById: actor.id, expiresAt })
    .returning({ id: invites.id });
  const token = await signToken({ purpose: "invite", jti: row.id, subject: input.email, expiresAt });
  await db.update(invites).set({ tokenHash: sha256Hex(token) }).where(eq(invites.id, row.id));

  const url = `${input.baseUrl}/admin/signup?token=${encodeURIComponent(token)}`;
  const mail = await sendEmail({
    to: input.email,
    subject: "You have been invited to the DevelMo admin console",
    text: [
      `${actor.email} has invited you to the DevelMo admin console as ${input.role}.`,
      "",
      "Set your password using this single use link, valid for 72 hours:",
      url,
      "",
      "If you were not expecting this, ignore this email.",
    ].join("\n"),
  });
  await audit({ actorId: actor.id, actorEmail: actor.email, action: "invite.create", entityType: "invite", entityId: row.id, after: { email: input.email, role: input.role }, ipHash: ctx.ipHash });
  return { ok: true, inviteId: row.id, url, expiresAt, emailed: mail.sent };
}

export type InviteCheck =
  | { ok: true; inviteId: string; email: string; role: Role }
  | { ok: false; reason: InviteFailure };

export async function checkInviteToken(token: string): Promise<InviteCheck> {
  const verified = await verifySignedToken(token, "invite");
  if (verified.status === "invalid") return { ok: false, reason: "malformed" };
  const [row] = await getDb().select().from(invites).where(eq(invites.id, verified.jti)).limit(1);
  if (!row || !safeEqual(row.tokenHash, sha256Hex(token))) return { ok: false, reason: "malformed" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (verified.status === "expired" || row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, inviteId: row.id, email: row.email, role: row.role };
}

export type InviteFailure = "malformed" | "expired" | "used" | "revoked";

export type RedeemResult =
  | { ok: true; token: string; expires: Date; needsMfaEnrolment: boolean }
  | { ok: false; reason: InviteFailure };

export async function redeemInvite(
  input: { token: string; name: string; password: string },
  ctx: Ctx,
): Promise<RedeemResult> {
  const check = await checkInviteToken(input.token);
  if (!check.ok) {
    await securityEvent({ type: "invite_rejected", ipHash: ctx.ipHash, path: "/admin/signup", userAgent: ctx.userAgent, meta: { reason: check.reason } });
    return { ok: false, reason: check.reason };
  }
  const db = getDb();
  // Single use under concurrency: only one UPDATE can claim the row.
  const claimed = await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(and(eq(invites.id, check.inviteId), isNull(invites.usedAt), isNull(invites.revokedAt)))
    .returning({ id: invites.id });
  if (claimed.length === 0) return { ok: false, reason: "used" };

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ email: check.email, name: input.name, passwordHash, role: check.role })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!user) return { ok: false, reason: "used" };

  const s = await createSession({ userId: user.id, ipHash: ctx.ipHash, userAgent: ctx.userAgent, mfaPending: false });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit({ actorId: user.id, actorEmail: user.email, action: "user.create", entityType: "user", entityId: user.id, after: publicUser(user), ipHash: ctx.ipHash });
  await securityEvent({ type: "invite_redeemed", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/signup", userAgent: ctx.userAgent });
  return { ok: true, token: s.token, expires: s.absoluteExpiresAt, needsMfaEnrolment: mfaRequired(user.role) };
}

export async function revokeInvite(actor: Actor, inviteId: string, ctx: Ctx): Promise<boolean> {
  const res = await getDb()
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), isNull(invites.revokedAt)));
  const done = (res.rowCount ?? 0) > 0;
  if (done) await audit({ actorId: actor.id, actorEmail: actor.email, action: "invite.revoke", entityType: "invite", entityId: inviteId, ipHash: ctx.ipHash });
  return done;
}

export async function resendInvite(
  actor: Actor,
  inviteId: string,
  baseUrl: string,
  ctx: Ctx,
): Promise<{ ok: true; url: string; emailed: boolean } | { ok: false }> {
  const [row] = await getDb().select().from(invites).where(eq(invites.id, inviteId)).limit(1);
  if (!row || row.usedAt || row.revokedAt) return { ok: false };
  if (!invitableRoles(actor.role).includes(row.role)) return { ok: false };
  await revokeInvite(actor, inviteId, ctx);
  const created = await createInvite(actor, { email: row.email, role: row.role, baseUrl }, ctx);
  if (!created.ok) return { ok: false };
  return { ok: true, url: created.url, emailed: created.emailed };
}

export async function listInvites() {
  return getDb()
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      revokedAt: invites.revokedAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(and(isNull(invites.usedAt), isNull(invites.revokedAt)))
    .orderBy(asc(invites.createdAt));
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

// Always resolves the same way whether or not the address exists. Returns the
// email to send (if any) so the caller can dispatch it after responding.
export async function preparePasswordReset(
  input: { email: string; ip: string; baseUrl: string },
  ctx: Ctx,
): Promise<{ rateLimited: boolean; retryAfter?: number; send?: { to: string; subject: string; text: string } }> {
  const ipLimit = await consumeLimit("reset", input.ip);
  const accountLimit = await consumeLimit("reset_account", input.email);
  if (ipLimit.limited || accountLimit.limited) {
    await securityEvent({ type: "rate_limited", email: input.email, ipHash: ctx.ipHash, path: "/admin/forgot-password", userAgent: ctx.userAgent });
    return { rateLimited: true, retryAfter: retryAfterSeconds(ipLimit.limited ? ipLimit : accountLimit) };
  }
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  await securityEvent({ type: "password_reset_requested", userId: user?.id ?? null, email: input.email, ipHash: ctx.ipHash, path: "/admin/forgot-password", userAgent: ctx.userAgent });
  if (!user || user.status !== "active") return { rateLimited: false };

  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const [row] = await db
    .insert(authTokens)
    .values({ type: "reset", userId: user.id, tokenHash: randomToken(16), expiresAt })
    .returning({ id: authTokens.id });
  const token = await signToken({ purpose: "reset", jti: row.id, subject: user.id, expiresAt });
  await db.update(authTokens).set({ tokenHash: sha256Hex(token) }).where(eq(authTokens.id, row.id));
  const url = `${input.baseUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;
  return {
    rateLimited: false,
    send: {
      to: user.email,
      subject: "Reset your DevelMo admin password",
      text: [
        "Someone asked to reset the password for this DevelMo admin account.",
        "",
        "Use this single use link within 60 minutes:",
        url,
        "",
        "If that was not you, ignore this email. Your password has not changed.",
      ].join("\n"),
    },
  };
}

export type ResetCheck =
  | { ok: true; tokenId: string; userId: string }
  | { ok: false; reason: "malformed" | "expired" | "used" };

export async function checkResetToken(token: string): Promise<ResetCheck> {
  const verified = await verifySignedToken(token, "reset");
  if (verified.status === "invalid") return { ok: false, reason: "malformed" };
  const [row] = await getDb().select().from(authTokens).where(eq(authTokens.id, verified.jti)).limit(1);
  if (!row || row.type !== "reset" || !safeEqual(row.tokenHash, sha256Hex(token))) return { ok: false, reason: "malformed" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (verified.status === "expired" || row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, tokenId: row.id, userId: row.userId };
}

export async function resetPassword(
  input: { token: string; password: string },
  ctx: Ctx,
): Promise<{ ok: true } | { ok: false; reason: "malformed" | "expired" | "used" }> {
  const check = await checkResetToken(input.token);
  if (!check.ok) return check;
  const db = getDb();
  const claimed = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, check.tokenId), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  if (claimed.length === 0) return { ok: false, reason: "used" };
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, check.userId))
    .returning();
  if (!user) return { ok: false, reason: "malformed" };
  // Every existing session is invalidated on a successful reset.
  await revokeAllSessions(user.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "password.reset", entityType: "user", entityId: user.id, ipHash: ctx.ipHash });
  await securityEvent({ type: "password_reset", userId: user.id, email: user.email, ipHash: ctx.ipHash, path: "/admin/reset-password", userAgent: ctx.userAgent });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function changePassword(
  auth: SessionWithUser,
  input: { currentPassword: string; newPassword: string },
  ctx: Ctx,
): Promise<{ ok: true; token: string } | { ok: false; code: "invalid_current" | "same" }> {
  const { user, session } = auth;
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) return { ok: false, code: "invalid_current" };
  if (input.currentPassword === input.newPassword) return { ok: false, code: "same" };
  const passwordHash = await hashPassword(input.newPassword);
  await getDb()
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await revokeOtherSessions(user.id, session.id);
  const token = await rotateSessionToken(session.id);
  await audit({ actorId: user.id, actorEmail: user.email, action: "password.change", entityType: "user", entityId: user.id, ipHash: ctx.ipHash });
  await securityEvent({ type: "password_changed", userId: user.id, email: user.email, ipHash: ctx.ipHash, userAgent: ctx.userAgent });
  return { ok: true, token };
}

export async function updateProfile(auth: SessionWithUser, input: { name: string }, ctx: Ctx): Promise<void> {
  const { user } = auth;
  await getDb().update(users).set({ name: input.name, updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit({ actorId: user.id, actorEmail: user.email, action: "profile.update", entityType: "user", entityId: user.id, before: { name: user.name }, after: { name: input.name }, ipHash: ctx.ipHash });
}

export async function prepareEmailChange(
  auth: SessionWithUser,
  input: { newEmail: string; currentPassword: string; ip: string; baseUrl: string },
  ctx: Ctx,
): Promise<{ ok: false; code: "invalid_current" | "rate_limited"; retryAfter?: number } | { ok: true; send?: { to: string; subject: string; text: string } }> {
  const { user } = auth;
  const limit = await consumeLimit("email_change", `user:${user.id}`);
  if (limit.limited) return { ok: false, code: "rate_limited", retryAfter: retryAfterSeconds(limit) };
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) return { ok: false, code: "invalid_current" };
  const db = getDb();
  await securityEvent({ type: "email_change_requested", userId: user.id, email: user.email, ipHash: ctx.ipHash, userAgent: ctx.userAgent, meta: { newEmail: input.newEmail } });
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.newEmail)).limit(1);
  // Same outward result whether or not the address is already in use.
  if (taken) return { ok: true };
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  const [row] = await db
    .insert(authTokens)
    .values({ type: "email_change", userId: user.id, tokenHash: randomToken(16), expiresAt, payload: { newEmail: input.newEmail } })
    .returning({ id: authTokens.id });
  const token = await signToken({ purpose: "email_change", jti: row.id, subject: user.id, expiresAt });
  await db.update(authTokens).set({ tokenHash: sha256Hex(token) }).where(eq(authTokens.id, row.id));
  const url = `${input.baseUrl}/api/admin/account/email/confirm?token=${encodeURIComponent(token)}`;
  return {
    ok: true,
    send: {
      to: input.newEmail,
      subject: "Confirm your new DevelMo admin email address",
      text: [
        `Confirm that ${input.newEmail} should become the sign in address for your DevelMo admin account.`,
        "",
        "Use this single use link within 60 minutes:",
        url,
        "",
        "If you did not request this, ignore this email.",
      ].join("\n"),
    },
  };
}

export async function confirmEmailChange(token: string, ctx: Ctx): Promise<{ ok: boolean }> {
  const verified = await verifySignedToken(token, "email_change");
  if (verified.status !== "ok") return { ok: false };
  const db = getDb();
  const [row] = await db.select().from(authTokens).where(eq(authTokens.id, verified.jti)).limit(1);
  if (!row || row.type !== "email_change" || !safeEqual(row.tokenHash, sha256Hex(token))) return { ok: false };
  if (row.usedAt || row.expiresAt.getTime() <= Date.now()) return { ok: false };
  const newEmail = (row.payload as { newEmail?: string } | null)?.newEmail;
  if (!newEmail) return { ok: false };
  const claimed = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  if (claimed.length === 0) return { ok: false };
  const [before] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!before) return { ok: false };
  try {
    await db.update(users).set({ email: newEmail, updatedAt: new Date() }).where(eq(users.id, row.userId));
  } catch {
    // The address was taken between request and confirmation (unique index).
    return { ok: false };
  }
  // The sign-in identifier changed: every session signs in again.
  await revokeAllSessions(before.id);
  await audit({ actorId: before.id, actorEmail: newEmail, action: "email.change", entityType: "user", entityId: before.id, before: { email: before.email }, after: { email: newEmail }, ipHash: ctx.ipHash });
  await securityEvent({ type: "email_changed", userId: before.id, email: newEmail, ipHash: ctx.ipHash, userAgent: ctx.userAgent, meta: { previous: before.email } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export async function listUsers() {
  return getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      totpEnabled: users.totpEnabled,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}

async function ownerCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "owner"), eq(users.status, "active")));
  return row?.n ?? 0;
}

export async function changeUserRole(
  actor: Actor,
  input: { userId: string; role: Role },
  ctx: Ctx,
): Promise<{ ok: true } | { ok: false; code: "not_found" | "forbidden" }> {
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) return { ok: false, code: "not_found" };
  const allowed = canChangeRole({
    actorRole: actor.role,
    actorIsTarget: actor.id === target.id,
    targetRole: target.role,
    next: input.role,
    ownerCount: await ownerCount(),
  });
  if (!allowed) return { ok: false, code: "forbidden" };
  await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, target.id));
  // Privilege change: the target signs in again under the new role.
  await revokeAllSessions(target.id);
  await audit({ actorId: actor.id, actorEmail: actor.email, action: "user.role_change", entityType: "user", entityId: target.id, before: { role: target.role }, after: { role: input.role }, ipHash: ctx.ipHash });
  return { ok: true };
}

export async function setUserStatus(
  actor: Actor,
  input: { userId: string; status: "active" | "deactivated" },
  ctx: Ctx,
): Promise<{ ok: true } | { ok: false; code: "not_found" | "forbidden" }> {
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) return { ok: false, code: "not_found" };
  if (target.status === input.status) return { ok: true };
  const owners = await ownerCount();
  const allowed =
    input.status === "deactivated"
      ? canRemoveUser({ actorRole: actor.role, actorIsTarget: actor.id === target.id, targetRole: target.role, ownerCount: owners })
      : canChangeRole({ actorRole: actor.role, actorIsTarget: false, targetRole: "viewer", next: "editor", ownerCount: owners }) &&
        (target.role !== "owner" || actor.role === "owner");
  if (!allowed) return { ok: false, code: "forbidden" };
  await db.update(users).set({ status: input.status, updatedAt: new Date() }).where(eq(users.id, target.id));
  if (input.status !== "active") await revokeAllSessions(target.id);
  await audit({ actorId: actor.id, actorEmail: actor.email, action: input.status === "active" ? "user.activate" : "user.deactivate", entityType: "user", entityId: target.id, before: { status: target.status }, after: { status: input.status }, ipHash: ctx.ipHash });
  return { ok: true };
}

export async function deleteUser(
  actor: Actor,
  input: { userId: string; confirm: string },
  ctx: Ctx,
): Promise<{ ok: true } | { ok: false; code: "not_found" | "forbidden" | "confirm" }> {
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) return { ok: false, code: "not_found" };
  const allowed = canRemoveUser({ actorRole: actor.role, actorIsTarget: actor.id === target.id, targetRole: target.role, ownerCount: await ownerCount() });
  if (!allowed) return { ok: false, code: "forbidden" };
  if (!safeEqual(input.confirm, target.email)) return { ok: false, code: "confirm" };
  await db.delete(users).where(eq(users.id, target.id));
  await audit({ actorId: actor.id, actorEmail: actor.email, action: "user.delete", entityType: "user", entityId: target.id, before: publicUser(target), ipHash: ctx.ipHash });
  return { ok: true };
}

export async function userCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(users);
  return row?.n ?? 0;
}
