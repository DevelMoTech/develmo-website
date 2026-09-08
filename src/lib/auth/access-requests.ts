import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accessRequests, users } from "@/db/schema";
import { getSetting } from "@/lib/admin/settings";
import { siteUrl } from "@/lib/email";
import { deliverNotice, type NoticeOutcome } from "@/lib/notify";
import type { AccessDecisionInput, AccessRequestInput } from "@/lib/schemas/access";
import { createInvite, type Actor, type Ctx } from "./flows";
import { audit } from "./log";
import type { Role } from "./rbac";

// The request queue behind the public "request access" form.
//
// A request is never an account and never a login. Approving it mints the
// same single-use invite that /admin/users mints by hand, so every account on
// the system still arrives through one invite-only path. That is what lets
// the form be public without making registration open.

export type AccessRequestView = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string;
  notifiedAt: Date | null;
  notifyChannel: string | null;
  notifyError: string | null;
  createdAt: Date;
};

// The public endpoint always answers the same way, so this returns nothing a
// stranger could read a signal from. A second request while one is still
// pending updates the existing row instead of queueing a duplicate.
export async function recordAccessRequest(
  input: AccessRequestInput,
  ctx: { ipHash: string | null; userAgent: string | null },
): Promise<{ stored: boolean; id: string | null }> {
  const db = getDb();

  // Someone who already has an account does not need a request; say nothing
  // and store nothing, so the form cannot be used to test for addresses.
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existingUser) return { stored: false, id: null };

  const [open] = await db
    .select({ id: accessRequests.id })
    .from(accessRequests)
    .where(and(eq(accessRequests.email, input.email), eq(accessRequests.status, "pending")))
    .limit(1);

  if (open) {
    await db
      .update(accessRequests)
      .set({
        name: input.name,
        organisation: input.organisation ?? "",
        reason: input.reason,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        updatedAt: new Date(),
      })
      .where(eq(accessRequests.id, open.id));
    return { stored: true, id: open.id };
  }

  const [row] = await db
    .insert(accessRequests)
    .values({
      name: input.name,
      email: input.email,
      organisation: input.organisation ?? "",
      reason: input.reason,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    })
    .returning({ id: accessRequests.id });
  return { stored: true, id: row.id };
}

// Tells the configured admin address that a request is waiting. Runs after
// the public response, and again on demand from the console. The outcome is
// written to the row whatever it was, so the queue shows whether anyone was
// actually told. Never throws.
export async function notifyAdminOfRequest(id: string): Promise<NoticeOutcome | null> {
  const db = getDb();
  const [row] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
  if (!row) return null;
  const { notifyEmail } = await getSetting("access_requests");
  const decideUrl = `${siteUrl()}/admin/users`;

  let outcome: NoticeOutcome;
  try {
    outcome = await deliverNotice({
      to: notifyEmail,
      replyTo: row.email,
      subject: `Access request from ${row.name}`,
      text: [
        `${row.name} <${row.email}> has asked for access to the DevelMo admin console.`,
        row.organisation ? `Company or team: ${row.organisation}` : "",
        "",
        "Why they need it:",
        row.reason,
        "",
        `Approve or decline it here: ${decideUrl}`,
        "",
        "Approving sends them a single use invitation. Declining sends nothing.",
      ]
        .filter((line, i, all) => line !== "" || all[i - 1] !== "")
        .join("\n"),
      fields: { name: row.name, email: row.email, organisation: row.organisation || "Not given", reason: row.reason, decide: decideUrl },
    });
  } catch (err) {
    outcome = { status: "failed", channel: null, error: err instanceof Error ? err.message : String(err) };
  }

  await db
    .update(accessRequests)
    .set({
      notifiedAt: outcome.status === "sent" ? new Date() : row.notifiedAt,
      notifyChannel: outcome.status === "sent" ? outcome.channel : row.notifyChannel,
      notifyError: outcome.status === "sent" ? null : outcome.error,
      updatedAt: new Date(),
    })
    .where(eq(accessRequests.id, id));
  if (outcome.status === "failed") console.warn(`[access-request] admin notification for ${id} failed: ${outcome.error}`);
  return outcome;
}

export async function listAccessRequests(limit = 100): Promise<AccessRequestView[]> {
  const rows = await getDb()
    .select({
      id: accessRequests.id,
      name: accessRequests.name,
      email: accessRequests.email,
      organisation: accessRequests.organisation,
      reason: accessRequests.reason,
      status: accessRequests.status,
      decidedAt: accessRequests.decidedAt,
      decisionNote: accessRequests.decisionNote,
      notifiedAt: accessRequests.notifiedAt,
      notifyChannel: accessRequests.notifyChannel,
      notifyError: accessRequests.notifyError,
      createdAt: accessRequests.createdAt,
      decidedBy: users.email,
    })
    .from(accessRequests)
    .leftJoin(users, eq(users.id, accessRequests.decidedById))
    // Pending first, then most recently decided.
    .orderBy(sql`case when ${accessRequests.status} = 'pending' then 0 else 1 end`, desc(accessRequests.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, decidedBy: r.decidedBy ?? null }));
}

export async function pendingAccessRequestCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"));
  return row?.n ?? 0;
}

export type DecisionResult =
  | { ok: true; decision: "approve"; emailed: boolean; url: string }
  | { ok: true; decision: "decline" }
  | { ok: false; code: "not_found" | "already_decided" | "forbidden" | "exists" };

export async function decideAccessRequest(
  actor: Actor,
  input: AccessDecisionInput,
  ctx: Ctx & { baseUrl: string },
): Promise<DecisionResult> {
  const db = getDb();
  const [row] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
  if (!row) return { ok: false, code: "not_found" };
  if (row.status !== "pending") return { ok: false, code: "already_decided" };

  if (input.decision === "decline") {
    // No email on a decline. Telling a stranger their probe was seen is a
    // signal worth withholding; the console keeps the record either way.
    await db
      .update(accessRequests)
      .set({ status: "declined", decidedById: actor.id, decidedAt: new Date(), decisionNote: input.note ?? "", updatedAt: new Date() })
      .where(and(eq(accessRequests.id, row.id), isNull(accessRequests.decidedAt)));
    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "access_request.decline",
      entityType: "access_request",
      entityId: row.id,
      before: { email: row.email, status: row.status },
      after: { status: "declined", note: input.note ?? "" },
      ipHash: ctx.ipHash,
    });
    return { ok: true, decision: "decline" };
  }

  const invited = await createInvite(actor, { email: row.email, role: input.role as Role, baseUrl: ctx.baseUrl }, ctx);
  if (!invited.ok) return { ok: false, code: invited.code };

  await db
    .update(accessRequests)
    .set({
      status: "approved",
      inviteId: invited.inviteId,
      decidedById: actor.id,
      decidedAt: new Date(),
      decisionNote: input.note ?? "",
      updatedAt: new Date(),
    })
    .where(and(eq(accessRequests.id, row.id), isNull(accessRequests.decidedAt)));

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "access_request.approve",
    entityType: "access_request",
    entityId: row.id,
    before: { email: row.email, status: row.status },
    after: { status: "approved", role: input.role, inviteId: invited.inviteId },
    ipHash: ctx.ipHash,
  });
  return { ok: true, decision: "approve", emailed: invited.emailed, url: invited.url };
}
