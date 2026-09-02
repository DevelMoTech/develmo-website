import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { parseTableParams, type TableParams } from "./table";

export const AUDIT_TABLE = {
  sortKeys: ["createdAt", "action", "actorEmail", "entityType"] as const,
  defaultSort: "createdAt",
  defaultDir: "desc" as const,
  pageSize: 25,
  filterKeys: ["action", "actor", "entity", "from", "to", "mine"] as const,
};

export function parseAuditParams(sp: Record<string, string | string[] | undefined>): TableParams {
  return parseTableParams(sp, AUDIT_TABLE);
}

function dateOnly(v: string | undefined): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function auditWhere(params: TableParams, userId: string): SQL | undefined {
  const clauses: SQL[] = [];
  const f = params.filters;
  if (f.action) clauses.push(eq(auditLog.action, f.action));
  if (f.actor) clauses.push(eq(auditLog.actorEmail, f.actor));
  if (f.entity) clauses.push(eq(auditLog.entityType, f.entity));
  if (f.mine === "1") clauses.push(eq(auditLog.actorId, userId));
  const from = dateOnly(f.from);
  if (from) clauses.push(gte(auditLog.createdAt, from));
  const to = dateOnly(f.to);
  if (to) clauses.push(lt(auditLog.createdAt, new Date(to.getTime() + 24 * 60 * 60 * 1000)));
  if (params.q) {
    const needle = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push(
      or(ilike(auditLog.action, needle), ilike(auditLog.entityType, needle), ilike(auditLog.entityId, needle), ilike(auditLog.actorEmail, needle))!,
    );
  }
  return clauses.length ? and(...clauses) : undefined;
}

const SORT_COLUMNS = {
  createdAt: auditLog.createdAt,
  action: auditLog.action,
  actorEmail: auditLog.actorEmail,
  entityType: auditLog.entityType,
} as const;

export type AuditRow = typeof auditLog.$inferSelect;

export async function fetchAudit(params: TableParams, userId: string, limit = params.pageSize, offset = (params.page - 1) * params.pageSize) {
  const db = getDb();
  const where = auditWhere(params, userId);
  const col = SORT_COLUMNS[params.sort as keyof typeof SORT_COLUMNS] ?? auditLog.createdAt;
  const [rows, totalRow] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(params.dir === "asc" ? asc(col) : desc(col), desc(auditLog.id)).limit(limit).offset(offset),
    db.select({ n: count() }).from(auditLog).where(where),
  ]);
  return { rows, total: totalRow[0]?.n ?? 0 };
}

export async function auditFilterOptions() {
  const db = getDb();
  const [actions, actors, entities] = await Promise.all([
    db.select({ v: auditLog.action }).from(auditLog).groupBy(auditLog.action).orderBy(auditLog.action),
    db.select({ v: auditLog.actorEmail }).from(auditLog).where(sql`${auditLog.actorEmail} is not null`).groupBy(auditLog.actorEmail).orderBy(auditLog.actorEmail),
    db.select({ v: auditLog.entityType }).from(auditLog).groupBy(auditLog.entityType).orderBy(auditLog.entityType),
  ]);
  return {
    actions: actions.map((r) => r.v),
    actors: actors.map((r) => r.v).filter((v): v is string => !!v),
    entities: entities.map((r) => r.v),
  };
}

// Key-level diff of the before/after snapshots for display.
export function diffEntries(before: unknown, after: unknown): { key: string; before: string | null; after: string | null }[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  const show = (v: unknown) => (v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
  return keys
    .map((key) => ({ key, before: show(b[key]), after: show(a[key]) }))
    .filter((e) => e.before !== e.after);
}
