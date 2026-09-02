import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256Hex } from "./tokens";

export const SESSION_COOKIE = "__Host-dm_session";
export const CSRF_COOKIE = "__Host-dm_csrf";

export const IDLE_MS = 8 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
// lastSeenAt / idleExpiresAt are refreshed at most this often, not per request.
export const TOUCH_MS = 5 * 60 * 1000;

export type SessionRow = typeof sessions.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SessionWithUser = { session: SessionRow; user: UserRow };

// Sliding idle expiry, capped by the absolute expiry.
export function computeIdleExpiry(now: Date, absoluteExpiresAt: Date): Date {
  const idle = new Date(now.getTime() + IDLE_MS);
  return idle < absoluteExpiresAt ? idle : absoluteExpiresAt;
}

export function isSessionLive(
  s: Pick<SessionRow, "revokedAt" | "idleExpiresAt" | "absoluteExpiresAt">,
  now: Date,
): boolean {
  if (s.revokedAt) return false;
  if (s.idleExpiresAt.getTime() <= now.getTime()) return false;
  if (s.absoluteExpiresAt.getTime() <= now.getTime()) return false;
  return true;
}

// __Host- prefix: Secure, Path=/, no Domain. Browsers treat localhost as a
// secure context, so the same cookie works in local dev and e2e.
export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", expires };
}

export function clearedCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 0 };
}

export async function createSession(opts: {
  userId: string;
  ipHash: string | null;
  userAgent: string | null;
  mfaPending: boolean;
}): Promise<{ token: string; id: string; absoluteExpiresAt: Date }> {
  const token = randomToken(32);
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  const [row] = await getDb()
    .insert(sessions)
    .values({
      userId: opts.userId,
      tokenHash: sha256Hex(token),
      mfaPending: opts.mfaPending,
      ipHash: opts.ipHash,
      userAgent: opts.userAgent?.slice(0, 512) ?? null,
      idleExpiresAt: computeIdleExpiry(now, absoluteExpiresAt),
      absoluteExpiresAt,
    })
    .returning({ id: sessions.id });
  return { token, id: row.id, absoluteExpiresAt };
}

export async function loadSession(token: string | undefined | null): Promise<SessionWithUser | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const db = getDb();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256Hex(token)))
    .limit(1);
  const hit = rows[0];
  if (!hit) return null;
  const now = new Date();
  if (!isSessionLive(hit.session, now)) return null;
  if (hit.user.status !== "active") return null;
  if (now.getTime() - hit.session.lastSeenAt.getTime() > TOUCH_MS) {
    const idleExpiresAt = computeIdleExpiry(now, hit.session.absoluteExpiresAt);
    await db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt })
      .where(eq(sessions.id, hit.session.id));
    hit.session = { ...hit.session, lastSeenAt: now, idleExpiresAt };
  }
  return hit;
}

// Issues a fresh token for an existing session (privilege change: MFA passed,
// password changed). The previous token stops working immediately.
export async function rotateSessionToken(sessionId: string, patch: Partial<Pick<SessionRow, "mfaPending">> = {}): Promise<string> {
  const token = randomToken(32);
  await getDb()
    .update(sessions)
    .set({ tokenHash: sha256Hex(token), ...patch })
    .where(eq(sessions.id, sessionId));
  return token;
}

export async function revokeSession(sessionId: string, userId?: string): Promise<boolean> {
  const where = userId
    ? and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt))
    : and(eq(sessions.id, sessionId), isNull(sessions.revokedAt));
  const res = await getDb().update(sessions).set({ revokedAt: new Date() }).where(where);
  return (res.rowCount ?? 0) > 0;
}

export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const res = await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt)));
  return res.rowCount ?? 0;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const res = await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  return res.rowCount ?? 0;
}

export async function listActiveSessions(userId: string): Promise<SessionRow[]> {
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.lastSeenAt));
  const now = new Date();
  return rows.filter((s) => isSessionLive(s, now));
}
