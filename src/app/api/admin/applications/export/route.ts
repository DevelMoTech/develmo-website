import { adminRoute, apiError } from "@/lib/auth/api";
import { audit } from "@/lib/auth/log";
import { fetchApplications, parseApplicationParams } from "@/app/(admin)/_lib/applications-query";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// CSV of the current filtered pipeline view (same URL state as the pages).
export const GET = adminRoute({ auth: "required", permission: "submissions:read" }, async ({ req, auth, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (sp.assignee === "me") sp.assignee = auth.user.id;
  const params = parseApplicationParams(sp);
  const { rows } = await fetchApplications(params, MAX_ROWS, 0);
  const header = ["id", "submitted_at", "job", "job_slug", "name", "email", "location", "stage", "rating", "assignee", "cv_filename"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.id, r.createdAt, r.jobTitle, r.jobSlug, r.name, r.email, r.location, r.stage, r.rating, r.assigneeName, r.cvFilename].map(cell).join(","));
  }
  await audit({ actorId: auth.user.id, actorEmail: auth.user.email, action: "application.export", entityType: "application", entityId: params.filters.job ?? null, after: { rows: rows.length, filters: params.filters, q: params.q }, ipHash });
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
