import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { submissions, users } from "@/db/schema";
import { can } from "@/lib/auth/rbac";
import { sendEmail, siteUrl } from "@/lib/email";
import { qaAddress, type SubmissionRow } from "./delivery";

// Per-user submission digests (brief §3.5): "instant" mails each new enquiry
// as it lands, "daily" mails a summary once a day from the cron. Only users
// whose role can read submissions are ever mailed. Without RESEND_API_KEY
// the send is logged, not made, and nothing is marked as sent.

import type { DigestMode } from "@/lib/schemas/submission";

const DAY_MS = 24 * 60 * 60 * 1000;
// A daily digest goes at most once per 23 hours: an hourly cron sends one a
// day (drifting one hour earlier per day) and a daily cron never skips a
// day through a few minutes of drift.
const DAILY_GAP_MS = 23 * 60 * 60 * 1000;
const DIGEST_LIMIT = 200;

function describe(row: SubmissionRow): string {
  const bits = [row.kind, row.name || "(no name)", row.email, row.company, row.service && `service: ${row.service}`, row.intent && `intent: ${row.intent}`].filter(Boolean);
  return bits.join(" · ");
}

async function recipients(mode: DigestMode) {
  const rows = await getDb()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, digestLastSentAt: users.digestLastSentAt })
    .from(users)
    .where(and(eq(users.status, "active"), eq(users.digest, mode)));
  return rows.filter((u) => can(u.role, "submissions:read"));
}

export async function notifyInstantDigest(row: SubmissionRow): Promise<{ attempted: number; sent: number }> {
  // Spam and QA (@example.*) submissions never reach anyone's inbox.
  if (row.isSpam || qaAddress(row.email)) return { attempted: 0, sent: 0 };
  const list = await recipients("instant");
  let sent = 0;
  for (const u of list) {
    const result = await sendEmail({
      to: u.email,
      subject: `New ${row.kind}: ${row.name || row.email}`,
      text: [`A new ${row.kind} submission just arrived.`, "", describe(row), "", row.message ? row.message.slice(0, 1500) : "", "", `Open it: ${siteUrl()}/admin/submissions/${row.id}`, "", "You receive this because your digest preference is set to instant. Change it under Account."].join("\n"),
    });
    if (result.sent) sent += 1;
  }
  return { attempted: list.length, sent };
}

// Called by the cron. Returns how many users were due and how many mails went.
export async function sendDailyDigests(now = new Date()): Promise<{ due: number; attempted: number; sent: number }> {
  const db = getDb();
  const list = await recipients("daily");
  const due = list.filter((u) => !u.digestLastSentAt || now.getTime() - u.digestLastSentAt.getTime() >= DAILY_GAP_MS);
  let attempted = 0;
  let sent = 0;
  for (const u of due) {
    const since = u.digestLastSentAt ?? new Date(now.getTime() - DAY_MS);
    const rows = await db
      .select()
      .from(submissions)
      .where(and(gt(submissions.createdAt, since), eq(submissions.isSpam, false)))
      .orderBy(sql`${submissions.createdAt} desc`)
      .limit(DIGEST_LIMIT);
    const real = rows.filter((r) => !qaAddress(r.email));
    const truncated = rows.length === DIGEST_LIMIT;
    if (real.length === 0) continue;
    attempted += 1;
    const unread = real.filter((r) => r.status === "new").length;
    const result = await sendEmail({
      to: u.email,
      subject: `${real.length} new submission${real.length === 1 ? "" : "s"} since ${since.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      text: [
        `${real.length} submission${real.length === 1 ? "" : "s"} arrived, ${unread} still unread.`,
        "",
        ...real.map((r) => `- ${describe(r)} (${r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC) ${siteUrl()}/admin/submissions/${r.id}`),
        ...(truncated ? ["", `Only the newest ${DIGEST_LIMIT} are listed; the inbox has the rest.`] : []),
        "",
        `Inbox: ${siteUrl()}/admin/submissions`,
        "",
        "You receive this because your digest preference is set to daily. Change it under Account.",
      ].join("\n"),
    });
    if (result.sent) {
      sent += 1;
      await db.update(users).set({ digestLastSentAt: now }).where(eq(users.id, u.id));
    }
  }
  return { due: due.length, attempted, sent };
}

// Unread count for the sidebar badge: new, non-spam submissions.
export async function unreadSubmissionCount(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(and(eq(submissions.isSpam, false), eq(submissions.status, "new"), sql`${submissions.email} !~* '@example\\.(com|org|net)$'`));
  return rows[0]?.n ?? 0;
}
