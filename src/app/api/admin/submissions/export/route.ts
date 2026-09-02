import { adminRoute, apiError } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { fetchSubmissions, parseSubmissionParams } from "@/lib/admin/submissions";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : JSON.stringify(v);
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// CSV of the current filtered inbox view (same URL state as the page).
export const GET = adminRoute({ auth: "required", permission: "submissions:read" }, async ({ req, auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (sp.assignee === "me") sp.assignee = auth.user.id;
  const spam = sp.view === "spam";
  const params = parseSubmissionParams(sp);
  const { rows } = await fetchSubmissions(params, { spam, limit: MAX_ROWS, offset: 0 });
  const header = ["id", "received_at", "kind", "status", "name", "email", "company", "service", "intent", "industry", "tags", "assignee", "delivery_status", "delivery_channel", "spam_reason"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.createdAt, r.kind, r.status, r.name, r.email, r.company, r.service, r.intent, r.industry, r.tags, r.assigneeName, r.deliveryStatus, r.deliveryChannel, r.spamReason].map(cell).join(","));
  }
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "submission.export", entityType: "submission", after: { rows: rows.length, spam, filters: params.filters, q: params.q }, ipHash });
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="submissions-${spam ? "spam-" : ""}${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
