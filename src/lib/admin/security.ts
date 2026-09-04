import { and, count, desc, eq, gte, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { dependencyAudits, ipRules, rateLimitConfig, rateLimitHits, securityEvents, sessions, users } from "@/db/schema";
import { audit } from "@/lib/auth/log";
import { hashIp } from "@/lib/auth/ip";
import { revokeAllSessions } from "@/lib/auth/session";
import type { SessionWithUser } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/rbac";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { ACCESS_TAG } from "@/lib/security/access";
import { cidrSize, parseCidr, parseIp } from "@/lib/security/cidr";
import { DEFAULT_LIMITS, type LimiterKey } from "@/lib/ratelimit";
import { runDependencyAudit } from "@/lib/security/deps";
import type { Advisory, DependencySummary } from "@/lib/security/deps-types";
import { gradeHeaders, type HeaderReport } from "@/lib/security/headers-grade";
import { trustedOrigin } from "@/lib/seo/origin";
import { EDITABLE_LIMITS, type AccessRuleInput, type EditableLimit, type RateLimitInput, type TurnstileInput, type UserActionInput } from "@/lib/schemas/security";
import { parseTableParams, type TableParams } from "@/app/(admin)/_lib/table";

// Write and read side of the security manager (brief §3.7). Owner and Admin
// only; every route in the module carries the security:write permission,
// which the RBAC matrix grants to those two roles alone. Every action here
// writes an audit row.

export type Actor = { user: SessionWithUser["user"]; ipHash: string | null };

// The console's own module gate. `security:write` is owner and admin only,
// so read pages use it too rather than security:read, which Viewer holds.
export const SECURITY_PERMISSION = "security:write" as const;

const bust = (...tags: string[]) => {
  for (const t of tags) revalidateTag(t, { expire: 0 });
};

// ---------- Event log ----------

export const EVENT_SORT_KEYS = ["createdAt", "type", "email"] as const;
export const EVENT_FILTER_KEYS = ["type", "email", "from", "to", "path"] as const;

export function parseEventParams(sp: Record<string, string | string[] | undefined>): TableParams {
  return parseTableParams(sp, { sortKeys: EVENT_SORT_KEYS, defaultSort: "createdAt", defaultDir: "desc", pageSize: 50, filterKeys: EVENT_FILTER_KEYS });
}

export type EventRow = {
  id: string;
  type: string;
  email: string | null;
  userId: string | null;
  ipHash: string | null;
  path: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

function eventWhere(params: TableParams): SQL | undefined {
  const clauses: SQL[] = [];
  const f = params.filters;
  if (f.type) clauses.push(eq(securityEvents.type, f.type));
  if (f.email) clauses.push(sql`${securityEvents.email} ILIKE ${`%${f.email}%`}`);
  if (f.path) clauses.push(sql`${securityEvents.path} ILIKE ${`%${f.path}%`}`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) clauses.push(gte(securityEvents.createdAt, new Date(`${f.from}T00:00:00.000Z`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) clauses.push(lte(securityEvents.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
  if (params.q) {
    const like = `%${params.q}%`;
    const term = or(
      sql`${securityEvents.email} ILIKE ${like}`,
      sql`${securityEvents.path} ILIKE ${like}`,
      sql`${securityEvents.type} ILIKE ${like}`,
      sql`${securityEvents.userAgent} ILIKE ${like}`,
      sql`${securityEvents.meta}::text ILIKE ${like}`,
    );
    if (term) clauses.push(term);
  }
  return clauses.length ? and(...clauses) : undefined;
}

const EVENT_COLUMNS = {
  id: securityEvents.id,
  type: securityEvents.type,
  email: securityEvents.email,
  userId: securityEvents.userId,
  ipHash: securityEvents.ipHash,
  path: securityEvents.path,
  userAgent: securityEvents.userAgent,
  meta: securityEvents.meta,
  createdAt: securityEvents.createdAt,
};

function toEvent(r: typeof securityEvents.$inferSelect): EventRow {
  return { id: r.id, type: r.type, email: r.email, userId: r.userId, ipHash: r.ipHash, path: r.path, userAgent: r.userAgent, meta: (r.meta as Record<string, unknown> | null) ?? null, createdAt: r.createdAt.toISOString() };
}

export async function fetchEvents(params: TableParams, opts: { limit: number; offset: number }): Promise<{ rows: EventRow[]; total: number }> {
  const db = getDb();
  const where = eventWhere(params);
  const column = params.sort === "type" ? securityEvents.type : params.sort === "email" ? securityEvents.email : securityEvents.createdAt;
  const order = params.dir === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
  const [rows, totals] = await Promise.all([
    db.select(EVENT_COLUMNS).from(securityEvents).where(where).orderBy(order).limit(opts.limit).offset(opts.offset),
    db.select({ n: count() }).from(securityEvents).where(where),
  ]);
  return { rows: rows.map((r) => toEvent(r as typeof securityEvents.$inferSelect)), total: Number(totals[0]?.n ?? 0) };
}

// Every distinct type present, so the filter only offers what exists.
export async function eventTypeOptions(): Promise<{ value: string; label: string; n: number }[]> {
  const rows = await getDb().select({ type: securityEvents.type, n: count() }).from(securityEvents).groupBy(securityEvents.type).orderBy(desc(count()));
  return rows.map((r) => ({ value: r.type, label: r.type.replace(/_/g, " "), n: Number(r.n) }));
}

export async function exportEvents(params: TableParams, limit = 10_000): Promise<EventRow[]> {
  const rows = await getDb().select(EVENT_COLUMNS).from(securityEvents).where(eventWhere(params)).orderBy(desc(securityEvents.createdAt)).limit(limit);
  return rows.map((r) => toEvent(r as typeof securityEvents.$inferSelect));
}

// ---------- Access control ----------

export type AccessRuleRow = {
  id: string;
  cidr: string;
  action: "block" | "allow";
  reason: string;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  createdByEmail: string | null;
  addresses: number;
};

export async function listAccessRules(): Promise<AccessRuleRow[]> {
  const rows = await getDb()
    .select({ id: ipRules.id, cidr: ipRules.cidr, action: ipRules.action, reason: ipRules.reason, expiresAt: ipRules.expiresAt, createdAt: ipRules.createdAt, email: users.email })
    .from(ipRules)
    .leftJoin(users, eq(users.id, ipRules.createdById))
    .orderBy(desc(ipRules.createdAt));
  const now = Date.now();
  return rows.map((r) => {
    const parsed = parseCidr(r.cidr);
    return {
      id: r.id,
      cidr: r.cidr,
      action: r.action,
      reason: r.reason,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      expired: !!r.expiresAt && r.expiresAt.getTime() <= now,
      createdAt: r.createdAt.toISOString(),
      createdByEmail: r.email,
      addresses: parsed ? cidrSize(parsed) : 0,
    };
  });
}

export type SaveRuleResult =
  | { ok: true; id: string }
  | { ok: false; error: "invalid_cidr" | "duplicate" | "not_found" | "self_lockout"; detail?: string };

// The lockout guard: blocking a range that covers the requesting address is
// refused unless the exact address is typed back. The check runs on the
// server, so it cannot be skipped by calling the API directly.
export function coversAddress(cidrText: string, ip: string): boolean {
  const cidr = parseCidr(cidrText);
  const address = parseIp(ip);
  if (!cidr || !address) return false;
  const fullBytes = cidr.prefix >> 3;
  for (let i = 0; i < fullBytes; i++) if (address.bytes[i] !== cidr.bytes[i]) return false;
  const bits = cidr.prefix & 7;
  if (bits === 0) return true;
  const mask = (0xff << (8 - bits)) & 0xff;
  return (address.bytes[fullBytes] & mask) === (cidr.bytes[fullBytes] & mask);
}

export async function saveAccessRule(input: AccessRuleInput, actor: Actor, requestIp: string): Promise<SaveRuleResult> {
  const db = getDb();
  const parsed = parseCidr(input.cidr);
  if (!parsed) return { ok: false, error: "invalid_cidr" };
  const cidr = parsed.text;

  if (input.action === "block" && coversAddress(cidr, requestIp)) {
    const typed = input.confirm.trim();
    if (typed !== requestIp) {
      return { ok: false, error: "self_lockout", detail: `This rule covers the address you are connecting from (${requestIp}). Type that address into the confirmation field to block it anyway.` };
    }
  }

  const clash = (await db.select({ id: ipRules.id }).from(ipRules).where(eq(ipRules.cidr, cidr)).limit(1))[0];
  if (clash && clash.id !== input.id) return { ok: false, error: "duplicate" };

  const expiresAt = input.expiresAt ? new Date(`${input.expiresAt}T23:59:59.999Z`) : null;
  const values = { cidr, action: input.action, reason: input.reason ?? "", expiresAt };

  if (input.id) {
    const before = (await db.select().from(ipRules).where(eq(ipRules.id, input.id)).limit(1))[0];
    if (!before) return { ok: false, error: "not_found" };
    await db.update(ipRules).set(values).where(eq(ipRules.id, input.id));
    await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.ip_rule.update", entityType: "ip_rule", entityId: input.id, before: { cidr: before.cidr, action: before.action, reason: before.reason, expiresAt: before.expiresAt }, after: values, ipHash: actor.ipHash });
    bust(ACCESS_TAG);
    return { ok: true, id: input.id };
  }

  const inserted = (await db.insert(ipRules).values({ ...values, createdById: actor.user.id }).returning({ id: ipRules.id }))[0];
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: `security.ip_rule.${input.action}`, entityType: "ip_rule", entityId: inserted.id, after: values, ipHash: actor.ipHash });
  bust(ACCESS_TAG);
  return { ok: true, id: inserted.id };
}

export async function deleteAccessRule(id: string, actor: Actor): Promise<boolean> {
  const db = getDb();
  const before = (await db.select().from(ipRules).where(eq(ipRules.id, id)).limit(1))[0];
  if (!before) return false;
  await db.delete(ipRules).where(eq(ipRules.id, id));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.ip_rule.delete", entityType: "ip_rule", entityId: id, before: { cidr: before.cidr, action: before.action, reason: before.reason, expiresAt: before.expiresAt }, ipHash: actor.ipHash });
  bust(ACCESS_TAG);
  return true;
}

// ---------- Rate limits ----------

export type RateLimitRow = {
  key: EditableLimit;
  label: string;
  description: string;
  maxRequests: number;
  windowSeconds: number;
  isDefault: boolean;
  defaults: { maxRequests: number; windowSeconds: number };
  updatedAt: string | null;
  // Live counters from the durable fixed-window table.
  activeKeys: number;
  atLimit: number;
};

const LIMIT_META: Record<EditableLimit, { label: string; description: string }> = {
  contact: { label: "Contact form", description: "Submissions to /api/contact, per IP." },
  apply: { label: "Job application", description: "Submissions to /api/jobs/apply, per IP." },
  login: { label: "Login", description: "Password attempts at /admin/login, per IP." },
  reset: { label: "Password reset", description: "Reset requests, per IP." },
};

export async function listRateLimits(): Promise<RateLimitRow[]> {
  const db = getDb();
  const [configured, counters] = await Promise.all([
    db.select().from(rateLimitConfig),
    db
      .select({ key: rateLimitHits.key, n: rateLimitHits.count })
      .from(rateLimitHits)
      .where(gte(rateLimitHits.expiresAt, new Date())),
  ]);
  const byKey = new Map(configured.map((r) => [r.key, r]));
  return EDITABLE_LIMITS.map((key) => {
    const row = byKey.get(key);
    const defaults = DEFAULT_LIMITS[key as LimiterKey];
    const max = row?.maxRequests ?? defaults.max;
    const live = counters.filter((c) => c.key.startsWith(`${key}:`));
    return {
      key,
      label: LIMIT_META[key].label,
      description: LIMIT_META[key].description,
      maxRequests: max,
      windowSeconds: row?.windowSeconds ?? defaults.windowSeconds,
      isDefault: !row,
      defaults: { maxRequests: defaults.max, windowSeconds: defaults.windowSeconds },
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      activeKeys: live.length,
      atLimit: live.filter((c) => c.n >= max).length,
    };
  });
}

export async function saveRateLimit(input: RateLimitInput, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(rateLimitConfig).where(eq(rateLimitConfig.key, input.key)).limit(1))[0] ?? null;
  await db
    .insert(rateLimitConfig)
    .values({ key: input.key, maxRequests: input.maxRequests, windowSeconds: input.windowSeconds, updatedById: actor.user.id })
    .onConflictDoUpdate({ target: rateLimitConfig.key, set: { maxRequests: input.maxRequests, windowSeconds: input.windowSeconds, updatedById: actor.user.id, updatedAt: sql`now()` } });
  await audit({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action: "security.rate_limit.update",
    entityType: "rate_limit",
    entityId: input.key,
    before: before ? { maxRequests: before.maxRequests, windowSeconds: before.windowSeconds } : { maxRequests: DEFAULT_LIMITS[input.key as LimiterKey].max, windowSeconds: DEFAULT_LIMITS[input.key as LimiterKey].windowSeconds, source: "default" },
    after: { maxRequests: input.maxRequests, windowSeconds: input.windowSeconds },
    ipHash: actor.ipHash,
  });
}

export async function resetRateLimit(key: EditableLimit, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(rateLimitConfig).where(eq(rateLimitConfig.key, key)).limit(1))[0] ?? null;
  if (!before) return;
  await db.delete(rateLimitConfig).where(eq(rateLimitConfig.key, key));
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.rate_limit.reset", entityType: "rate_limit", entityId: key, before: { maxRequests: before.maxRequests, windowSeconds: before.windowSeconds }, ipHash: actor.ipHash });
}

// ---------- Turnstile ----------

export async function getTurnstile(): Promise<TurnstileInput & { secretConfigured: boolean }> {
  const value = await getSetting("turnstile");
  return { ...value, secretConfigured: !!process.env.TURNSTILE_SECRET_KEY };
}

export async function saveTurnstile(input: TurnstileInput, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.enabled && !input.siteKey) return { ok: false, error: "site_key_required" };
  if (input.enabled && !process.env.TURNSTILE_SECRET_KEY) return { ok: false, error: "secret_missing" };
  const before = await getSetting("turnstile");
  await setSetting("turnstile", input, actor.user.id);
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.turnstile.update", entityType: "settings", entityId: "turnstile", before, after: input, ipHash: actor.ipHash });
  bust("turnstile");
  return { ok: true };
}

// ---------- Sessions and users ----------

export type SessionRow = {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  mfaPending: boolean;
  ipHash: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  createdAt: string;
  // True for the session making this request, so the UI can say so.
  current: boolean;
};

export async function listActiveSessions(currentSessionId: string): Promise<SessionRow[]> {
  const now = new Date();
  const rows = await getDb()
    .select({
      id: sessions.id,
      userId: sessions.userId,
      mfaPending: sessions.mfaPending,
      ipHash: sessions.ipHash,
      userAgent: sessions.userAgent,
      lastSeenAt: sessions.lastSeenAt,
      idleExpiresAt: sessions.idleExpiresAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      createdAt: sessions.createdAt,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(isNull(sessions.revokedAt), gte(sessions.idleExpiresAt, now), gte(sessions.absoluteExpiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role,
    status: r.status,
    mfaPending: r.mfaPending,
    ipHash: r.ipHash,
    userAgent: r.userAgent,
    lastSeenAt: r.lastSeenAt.toISOString(),
    idleExpiresAt: r.idleExpiresAt.toISOString(),
    absoluteExpiresAt: r.absoluteExpiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    current: r.id === currentSessionId,
  }));
}

export async function revokeSession(sessionId: string, actor: Actor): Promise<boolean> {
  const db = getDb();
  const row = (await db.select({ id: sessions.id, userId: sessions.userId, revokedAt: sessions.revokedAt }).from(sessions).where(eq(sessions.id, sessionId)).limit(1))[0];
  if (!row || row.revokedAt) return false;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  const target = (await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1))[0];
  await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.session.revoke", entityType: "session", entityId: sessionId, before: { userId: row.userId, email: target?.email ?? null }, ipHash: actor.ipHash });
  return true;
}

// Whether the actor may act on this target. Admins cannot touch Owners, and
// nobody can lock themselves out of their own account.
function mayActOn(actorRole: Role, actorId: string, target: { id: string; role: Role }, action: UserActionInput["action"]): string | null {
  if (target.role === "owner" && actorRole !== "owner") return "Only an Owner can act on an Owner account.";
  if (target.id === actorId && (action === "lock" || action === "force_mfa_reenrol")) {
    return action === "lock" ? "You cannot lock your own account." : "Reset your own two-factor from Account, which asks for your password.";
  }
  return null;
}

export type UserActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function applyUserAction(input: UserActionInput, actor: Actor): Promise<UserActionResult> {
  const db = getDb();
  const target = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!target) return { ok: false, error: "User not found." };
  const refusal = mayActOn(actor.user.role, actor.user.id, { id: target.id, role: target.role }, input.action);
  if (refusal) return { ok: false, error: refusal };

  const trail = (action: string, before: unknown, after: unknown) =>
    audit({ actorId: actor.user.id, actorEmail: actor.user.email, action, entityType: "user", entityId: target.id, before, after, ipHash: actor.ipHash });

  switch (input.action) {
    case "logout_all": {
      const n = await revokeAllSessions(target.id);
      await trail("security.user.logout_all", { email: target.email }, { sessionsRevoked: n });
      return { ok: true, message: n === 0 ? `${target.email} had no active sessions.` : `Signed ${target.email} out of ${n} session${n === 1 ? "" : "s"}.` };
    }
    case "force_password_reset": {
      await db.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, target.id));
      const n = await revokeAllSessions(target.id);
      await trail("security.user.force_password_reset", { mustChangePassword: target.mustChangePassword }, { mustChangePassword: true, sessionsRevoked: n });
      return { ok: true, message: `${target.email} must set a new password at the next sign in.` };
    }
    case "force_mfa_reenrol": {
      await db.update(users).set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null, updatedAt: new Date() }).where(eq(users.id, target.id));
      const n = await revokeAllSessions(target.id);
      await trail("security.user.force_mfa_reenrol", { totpEnabled: target.totpEnabled }, { totpEnabled: false, sessionsRevoked: n });
      return { ok: true, message: `${target.email} must enrol two-factor again at the next sign in.` };
    }
    case "lock": {
      if (target.status === "locked") return { ok: true, message: `${target.email} is already locked.` };
      await db.update(users).set({ status: "locked", updatedAt: new Date() }).where(eq(users.id, target.id));
      const n = await revokeAllSessions(target.id);
      await trail("security.user.lock", { status: target.status }, { status: "locked", sessionsRevoked: n });
      return { ok: true, message: `${target.email} is locked out and signed out of ${n} session${n === 1 ? "" : "s"}.` };
    }
    case "unlock": {
      if (target.status !== "locked") return { ok: false, error: `${target.email} is ${target.status}, not locked.` };
      await db.update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, target.id));
      await trail("security.user.unlock", { status: target.status }, { status: "active" });
      return { ok: true, message: `${target.email} can sign in again.` };
    }
  }
}

export type OversightUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  activeSessions: number;
};

export async function listUsersForOversight(): Promise<OversightUser[]> {
  const now = new Date();
  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      totpEnabled: users.totpEnabled,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      activeSessions: sql<number>`(select count(*) from ${sessions} s where s.user_id = ${users.id} and s.revoked_at is null and s.idle_expires_at >= ${now} and s.absolute_expires_at >= ${now})`,
    })
    .from(users)
    .orderBy(users.email);
  return rows.map((r) => ({ ...r, lastLoginAt: r.lastLoginAt?.toISOString() ?? null, activeSessions: Number(r.activeSessions) }));
}

// ---------- Dependencies ----------

export type DependencyRun = {
  id: string;
  runAt: string;
  summary: DependencySummary | { error: string };
  advisories: Advisory[] | null;
};

export async function listDependencyRuns(limit = 10): Promise<DependencyRun[]> {
  const rows = await getDb().select().from(dependencyAudits).orderBy(desc(dependencyAudits.runAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, runAt: r.runAt.toISOString(), summary: r.summary as DependencySummary | { error: string }, advisories: (r.advisories as Advisory[] | null) ?? null }));
}

export async function recordDependencyAudit(actor: Actor | null): Promise<{ ok: true; summary: DependencySummary } | { ok: false; error: string }> {
  const db = getDb();
  try {
    const report = await runDependencyAudit();
    await db.insert(dependencyAudits).values({ summary: report.summary, advisories: report.advisories });
    if (actor) await audit({ actorId: actor.user.id, actorEmail: actor.user.email, action: "security.dependencies.scan", entityType: "dependency_audit", entityId: "npm", after: report.summary, ipHash: actor.ipHash });
    return { ok: true, summary: report.summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(dependencyAudits).values({ summary: { error: message }, advisories: null });
    return { ok: false, error: message };
  }
}

// ---------- Retention ----------

// Deletes security events past the configured window. The audit log is not
// touched: it is append only with no delete path, for any role.
export async function purgeSecurityEvents(now = new Date()): Promise<number> {
  const { eventDays } = await getSetting("security_retention");
  if (eventDays <= 0) return 0;
  const cutoff = new Date(now.getTime() - eventDays * 24 * 60 * 60 * 1000);
  const rows = await getDb().delete(securityEvents).where(lt(securityEvents.createdAt, cutoff)).returning({ id: securityEvents.id });
  if (rows.length) {
    await audit({ actorId: null, actorEmail: null, action: "security.events.purge", entityType: "security_event", entityId: "retention", after: { deleted: rows.length, olderThan: cutoff.toISOString(), days: eventDays } });
  }
  return rows.length;
}

// Expired access rules are dropped by the cron so the served rule set stays
// small and the console does not show clutter.
export async function purgeExpiredAccessRules(now = new Date()): Promise<number> {
  const rows = await getDb().delete(ipRules).where(and(sql`${ipRules.expiresAt} is not null`, lt(ipRules.expiresAt, now))).returning({ id: ipRules.id, cidr: ipRules.cidr });
  if (rows.length) {
    await audit({ actorId: null, actorEmail: null, action: "security.ip_rule.expire", entityType: "ip_rule", entityId: "expired", after: { removed: rows.map((r) => r.cidr) } });
    bust(ACCESS_TAG);
  }
  return rows.length;
}

// ---------- Response headers ----------

export type HeadersResult = { ok: true; report: HeaderReport; headers: Record<string, string> } | { ok: false; error: string };

// Read only: fetches a live URL on this deployment and grades what came
// back. It never sets or proposes a header; the policy is deployed with the
// code in next.config.ts.
export async function checkHeaders(baseUrl: string, path: string): Promise<HeadersResult> {
  const url = `${trustedOrigin(baseUrl)}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "user-agent": "DevelMo-Security-Console/1.0", accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    await res.arrayBuffer().catch(() => undefined);
    return { ok: true, report: gradeHeaders(url, res.status, headers), headers };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------- Overview ----------

export async function securityOverview(): Promise<{
  events24h: number;
  failedLogins24h: number;
  rateLimited24h: number;
  blockedIps: number;
  allowedIps: number;
  activeSessions: number;
  lockedUsers: number;
  lastScan: DependencyRun | null;
}> {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();
  const activeRule = or(isNull(ipRules.expiresAt), gte(ipRules.expiresAt, now));
  const [events, failed, limited, blocked, allowed, sess, locked, scans] = await Promise.all([
    db.select({ n: count() }).from(securityEvents).where(gte(securityEvents.createdAt, since)),
    db.select({ n: count() }).from(securityEvents).where(and(gte(securityEvents.createdAt, since), eq(securityEvents.type, "login_failed"))),
    db.select({ n: count() }).from(securityEvents).where(and(gte(securityEvents.createdAt, since), eq(securityEvents.type, "rate_limited"))),
    db.select({ n: count() }).from(ipRules).where(and(eq(ipRules.action, "block"), activeRule)),
    db.select({ n: count() }).from(ipRules).where(and(eq(ipRules.action, "allow"), activeRule)),
    db.select({ n: count() }).from(sessions).where(and(isNull(sessions.revokedAt), gte(sessions.idleExpiresAt, now), gte(sessions.absoluteExpiresAt, now))),
    db.select({ n: count() }).from(users).where(eq(users.status, "locked")),
    listDependencyRuns(1),
  ]);
  const n = (r: { n: number }[]) => Number(r[0]?.n ?? 0);
  return {
    events24h: n(events),
    failedLogins24h: n(failed),
    rateLimited24h: n(limited),
    blockedIps: n(blocked),
    allowedIps: n(allowed),
    activeSessions: n(sess),
    lockedUsers: n(locked),
    lastScan: scans[0] ?? null,
  };
}

// The console shows the hash prefix of the requesting address so an operator
// can tie an event to themselves without the address being stored.
export function ipHashPrefix(ip: string): string {
  return hashIp(ip).slice(0, 12);
}
