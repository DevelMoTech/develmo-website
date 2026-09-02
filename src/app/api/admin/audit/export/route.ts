import { adminRoute, apiError } from "@/lib/auth/api";
import { fetchAudit, parseAuditParams } from "@/app/(admin)/_lib/audit-query";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV of the current filtered audit view (same URL state as the page).
export const GET = adminRoute({ auth: "required", permission: "audit:read" }, async ({ req, auth }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const params = parseAuditParams(sp);
  const { rows } = await fetchAudit(params, auth.user.id, MAX_ROWS, 0);
  const header = ["id", "created_at", "actor_email", "actor_id", "action", "entity_type", "entity_id", "before", "after"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.createdAt.toISOString(), r.actorEmail, r.actorId, r.action, r.entityType, r.entityId, r.before, r.after].map(cell).join(","));
  }
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
