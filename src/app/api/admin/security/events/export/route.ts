import { adminRoute, apiError } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { exportEvents, parseEventParams, SECURITY_PERMISSION } from "@/lib/admin/security";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// CSV of the current filtered event view (same URL state as the page). The
// IP hash is exported, never an address: only the hash is ever stored.
export const GET = adminRoute({ auth: "required", permission: SECURITY_PERMISSION }, async ({ req, auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const params = parseEventParams(sp);
  const rows = await exportEvents(params, MAX_ROWS);
  const header = ["id", "occurred_at", "type", "email", "user_id", "ip_hash", "path", "user_agent", "meta"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.createdAt, r.type, r.email, r.userId, r.ipHash, r.path, r.userAgent, r.meta].map(cell).join(","));
  }
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "security.events.export", entityType: "security_event", after: { rows: rows.length, filters: params.filters, q: params.q }, ipHash });
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="security-events-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
