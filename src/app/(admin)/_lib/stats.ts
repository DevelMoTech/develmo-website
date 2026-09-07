import { and, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  applications,
  auditLog,
  contentEntries,
  ipRules,
  jobs,
  media,
  posts,
  rateLimitConfig,
  redirects,
  securityEvents,
  seoOverrides,
  settings,
  submissions,
  translations,
  webVitals,
} from "@/db/schema";
import { can, type Role } from "@/lib/auth/rbac";
import type { NotificationItem } from "../_components/shell/Notifications";

// Every number on the dashboard comes from these queries (brief §3.2: real
// data, no placeholders). Failures propagate to the route error boundary,
// except the health probes which report their own state.

const DAY_MS = 24 * 60 * 60 * 1000;

function n(row: { n: number } | undefined): number {
  return row?.n ?? 0;
}

export function relativeTime(d: Date, now = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return d.toISOString().slice(0, 10);
}

export async function submissionStats() {
  const db = getDb();
  const since = new Date(Date.now() - 7 * DAY_MS);
  const [unread, total, spam, recent] = await Promise.all([
    db.select({ n: count() }).from(submissions).where(and(eq(submissions.status, "new"), eq(submissions.isSpam, false))),
    db.select({ n: count() }).from(submissions).where(eq(submissions.isSpam, false)),
    db.select({ n: count() }).from(submissions).where(eq(submissions.isSpam, true)),
    db
      .select({ day: sql<string>`to_char(${submissions.createdAt} at time zone 'utc', 'YYYY-MM-DD')`, n: count() })
      .from(submissions)
      .where(and(gte(submissions.createdAt, since), eq(submissions.isSpam, false)))
      .groupBy(sql`1`),
  ]);
  const byDay = new Map(recent.map((r) => [r.day, r.n]));
  const spark: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    spark.push(byDay.get(day) ?? 0);
  }
  return { unread: n(unread[0]), total: n(total[0]), spam: n(spam[0]), spark };
}

export async function postStats() {
  const db = getDb();
  const rows = await db.select({ status: posts.status, type: posts.type, n: count() }).from(posts).groupBy(posts.status, posts.type);
  const by = (status: string) => rows.filter((r) => r.status === status).reduce((a, r) => a + r.n, 0);
  return { published: by("published"), drafts: by("draft"), scheduled: by("scheduled"), archived: by("archived"), total: rows.reduce((a, r) => a + r.n, 0) };
}

export async function jobStats() {
  const db = getDb();
  const [open, total, newApps, totalApps] = await Promise.all([
    db.select({ n: count() }).from(jobs).where(eq(jobs.status, "open")),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(applications).where(eq(applications.stage, "new")),
    db.select({ n: count() }).from(applications),
  ]);
  return { open: n(open[0]), total: n(total[0]), newApplications: n(newApps[0]), applications: n(totalApps[0]) };
}

export async function vitalsStats() {
  const db = getDb();
  const since = new Date(Date.now() - 7 * DAY_MS);
  const rows = await db
    .select({
      metric: webVitals.metric,
      p75: sql<number>`percentile_cont(0.75) within group (order by ${webVitals.value})`,
      n: count(),
    })
    .from(webVitals)
    .where(gte(webVitals.createdAt, since))
    .groupBy(webVitals.metric);
  const get = (m: string) => rows.find((r) => r.metric === m);
  return {
    samples: rows.reduce((a, r) => a + r.n, 0),
    lcp: get("LCP")?.p75 ?? null,
    inp: get("INP")?.p75 ?? null,
    cls: get("CLS")?.p75 ?? null,
  };
}

export async function securityStats() {
  const db = getDb();
  const since = new Date(Date.now() - DAY_MS);
  const [events, blocked] = await Promise.all([
    db.select({ type: securityEvents.type, n: count() }).from(securityEvents).where(gte(securityEvents.createdAt, since)).groupBy(securityEvents.type),
    db.select({ n: count() }).from(ipRules).where(and(eq(ipRules.action, "block"), or(isNull(ipRules.expiresAt), gte(ipRules.expiresAt, new Date())))),
  ]);
  const by = (t: string) => events.find((e) => e.type === t)?.n ?? 0;
  return {
    failedLogins: by("login_failed") + by("login_locked"),
    rateLimited: by("rate_limited"),
    blockedIps: n(blocked[0]),
    total: events.reduce((a, e) => a + e.n, 0),
  };
}

let emailProbe: { at: number; ok: boolean | null; detail: string } | null = null;

// Health strip (brief §3.2). The email probe is cached per instance for five
// minutes so the dashboard never hammers Resend.
export async function healthStats() {
  const db = getDb();
  let dbOk = false;
  let dbMs = 0;
  try {
    const t = Date.now();
    await db.execute(sql`select 1`);
    dbMs = Date.now() - t;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    emailProbe = { at: Date.now(), ok: null, detail: "Not configured (RESEND_API_KEY unset)" };
  } else if (!emailProbe || Date.now() - emailProbe.at > 5 * 60 * 1000) {
    try {
      const res = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3000) });
      emailProbe = { at: Date.now(), ok: res.ok, detail: res.ok ? "Resend reachable" : `Resend answered ${res.status}` };
    } catch {
      emailProbe = { at: Date.now(), ok: false, detail: "Resend unreachable" };
    }
  }

  const [lastPublish, lastRevalidate] = await Promise.all([
    db.select({ at: auditLog.createdAt, action: auditLog.action }).from(auditLog).where(sql`${auditLog.action} in ('post.publish', 'job.publish', 'content.publish')`).orderBy(desc(auditLog.createdAt)).limit(1),
    db.select({ at: auditLog.createdAt }).from(auditLog).where(sql`${auditLog.action} like 'cache.%'`).orderBy(desc(auditLog.createdAt)).limit(1),
  ]);

  return {
    db: { ok: dbOk, detail: dbOk ? `Reachable, ${dbMs} ms` : "Unreachable" },
    email: emailProbe,
    lastPublish: lastPublish[0]?.at ?? null,
    lastRevalidate: lastRevalidate[0]?.at ?? null,
  };
}

export async function recentActivity(limit = 8) {
  return getDb()
    .select({ id: auditLog.id, action: auditLog.action, actorEmail: auditLog.actorEmail, entityType: auditLog.entityType, entityId: auditLog.entityId, createdAt: auditLog.createdAt })
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function recentNotifications(role: Role): Promise<{ items: NotificationItem[]; unread: number }> {
  const db = getDb();
  const since = new Date(Date.now() - DAY_MS);
  const items: (NotificationItem & { at: Date })[] = [];
  if (can(role, "submissions:read")) {
    const rows = await db
      .select({ id: submissions.id, name: submissions.name, email: submissions.email, kind: submissions.kind, createdAt: submissions.createdAt })
      .from(submissions)
      .where(and(gte(submissions.createdAt, since), eq(submissions.isSpam, false), eq(submissions.status, "new")))
      .orderBy(desc(submissions.createdAt))
      .limit(5);
    for (const r of rows) items.push({ id: `s-${r.id}`, at: r.createdAt, title: `New ${r.kind}`, detail: r.name || r.email, when: relativeTime(r.createdAt), href: `/admin/submissions/${r.id}` });
  }
  if (can(role, "security:read")) {
    const rows = await db
      .select({ id: securityEvents.id, type: securityEvents.type, email: securityEvents.email, createdAt: securityEvents.createdAt })
      .from(securityEvents)
      .where(and(gte(securityEvents.createdAt, since), sql`${securityEvents.type} in ('login_failed','login_locked','rate_limited','permission_denied','csrf_rejected')`))
      .orderBy(desc(securityEvents.createdAt))
      .limit(5);
    for (const r of rows) items.push({ id: `e-${r.id}`, at: r.createdAt, title: r.type.replace(/_/g, " "), detail: r.email ?? "unknown account", when: relativeTime(r.createdAt), href: "/admin/security" });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items: items.slice(0, 8).map((item) => ({ id: item.id, title: item.title, detail: item.detail, when: item.when, href: item.href })), unread: items.length };
}

// Real counts for the module overview pages.
export async function moduleCounts() {
  const db = getDb();
  const [mediaN, seoN, redirectN, contentN, translationN, settingN, secN, vitalsN, rlN] = await Promise.all([
    db.select({ n: count() }).from(media),
    db.select({ n: count() }).from(seoOverrides),
    db.select({ n: count() }).from(redirects),
    db.select({ entity: contentEntries.entity, n: count() }).from(contentEntries).groupBy(contentEntries.entity),
    db.select({ locale: translations.locale, n: count() }).from(translations).groupBy(translations.locale),
    db.select({ n: count() }).from(settings),
    db.select({ n: count() }).from(securityEvents),
    db.select({ n: count() }).from(webVitals),
    db.select({ n: count() }).from(rateLimitConfig),
  ]);
  return {
    media: n(mediaN[0]),
    seoOverrides: n(seoN[0]),
    redirects: n(redirectN[0]),
    content: Object.fromEntries(contentN.map((r) => [r.entity, r.n])) as Record<string, number>,
    translations: Object.fromEntries(translationN.map((r) => [r.locale, r.n])) as Record<string, number>,
    settings: n(settingN[0]),
    securityEvents: n(secN[0]),
    vitals: n(vitalsN[0]),
    rateLimitOverrides: n(rlN[0]),
  };
}
