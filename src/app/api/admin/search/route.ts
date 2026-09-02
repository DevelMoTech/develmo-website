import { desc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { applications, jobs, posts, submissions, users } from "@/db/schema";
import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { can } from "@/lib/auth/rbac";
import { NAV_GROUPS } from "@/app/(admin)/_lib/nav";

export const runtime = "nodejs";

const querySchema = z.string().trim().min(1).max(80);

export type SearchHit = { group: string; label: string; detail?: string; href: string };

// Global search: console pages by name, then records the caller may read.
// Record hits link to the module list filtered by the same query.
export const GET = adminRoute({ auth: "required" }, async ({ req, auth }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const parsed = querySchema.safeParse(new URL(req.url).searchParams.get("q") ?? "");
  if (!parsed.success) return apiOk({ hits: [] });
  const q = parsed.data;
  const needle = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const role = auth.user.role;
  const hits: SearchHit[] = [];

  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.permission && !can(role, item.permission)) continue;
      if (item.label.toLowerCase().includes(q.toLowerCase()) || item.description.toLowerCase().includes(q.toLowerCase())) {
        hits.push({ group: "Pages", label: item.label, detail: item.description, href: item.href });
      }
    }
  }

  const db = getDb();
  if (can(role, "content:read")) {
    const rows = await db
      .select({ id: posts.id, title: posts.title, slug: posts.slug, status: posts.status })
      .from(posts)
      .where(or(ilike(posts.title, needle), ilike(posts.slug, needle)))
      .orderBy(desc(posts.updatedAt))
      .limit(5);
    for (const r of rows) hits.push({ group: "Posts", label: r.title, detail: r.status, href: `/admin/posts/${r.id}` });
    const jobRows = await db
      .select({ id: jobs.id, title: jobs.title, slug: jobs.slug, status: jobs.status })
      .from(jobs)
      .where(or(ilike(jobs.title, needle), ilike(jobs.slug, needle)))
      .orderBy(desc(jobs.updatedAt))
      .limit(5);
    for (const r of jobRows) hits.push({ group: "Jobs", label: r.title, detail: r.status, href: `/admin/jobs/${r.id}` });
  }
  if (can(role, "submissions:read")) {
    const appRows = await db
      .select({ id: applications.id, name: applications.name, email: applications.email, stage: applications.stage })
      .from(applications)
      .where(or(ilike(applications.name, needle), ilike(applications.email, needle)))
      .orderBy(desc(applications.createdAt))
      .limit(5);
    for (const r of appRows) hits.push({ group: "Applications", label: r.name, detail: `${r.email} (${r.stage})`, href: `/admin/applications/${r.id}` });
    const rows = await db
      .select({ id: submissions.id, name: submissions.name, email: submissions.email, company: submissions.company })
      .from(submissions)
      .where(or(ilike(submissions.name, needle), ilike(submissions.email, needle), ilike(submissions.company, needle)))
      .orderBy(desc(submissions.createdAt))
      .limit(5);
    for (const r of rows) hits.push({ group: "Submissions", label: r.name || r.email, detail: r.company || r.email, href: `/admin/submissions/${r.id}` });
  }
  if (can(role, "users:read")) {
    const rows = await db
      .select({ name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(or(ilike(users.name, needle), ilike(users.email, needle)))
      .orderBy(sql`lower(${users.name})`)
      .limit(5);
    for (const r of rows) hits.push({ group: "Users", label: r.name, detail: `${r.email} (${r.role})`, href: `/admin/users?q=${encodeURIComponent(r.email)}` });
  }

  return apiOk({ hits: hits.slice(0, 20) });
});
