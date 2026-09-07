// The full admin route inventory for the phase 11 polish sweep, plus the
// fixtures the dynamic routes need. Every page under src/app/(admin) appears
// here; a route added later without a line here fails the inventory check in
// admin-polish.spec.ts.

import type { APIRequestContext } from "@playwright/test";
import { db } from "./admin";

// Routes reachable without a session.
export const PUBLIC_ADMIN_ROUTES = [
  "/admin/login",
  "/admin/signup",
  "/admin/forgot-password",
  "/admin/reset-password",
  "/admin/request-access",
];

// Routes behind the session gate that need no id.
export const SHELL_ROUTES = [
  "/admin",
  "/admin/account",
  "/admin/applications",
  "/admin/audit",
  "/admin/content",
  "/admin/content/about",
  "/admin/content/industries",
  "/admin/content/navigation",
  "/admin/content/products",
  "/admin/content/services",
  "/admin/content/site",
  "/admin/jobs",
  "/admin/jobs/new",
  "/admin/jobs/templates",
  "/admin/media",
  "/admin/performance",
  "/admin/performance/assets",
  "/admin/performance/build",
  "/admin/performance/cache",
  "/admin/performance/media",
  "/admin/performance/psi",
  "/admin/posts",
  "/admin/posts/new",
  "/admin/security",
  "/admin/security/access",
  "/admin/security/dependencies",
  "/admin/security/events",
  "/admin/security/headers",
  "/admin/security/limits",
  "/admin/security/sessions",
  "/admin/seo",
  "/admin/seo/audit",
  "/admin/seo/pages",
  "/admin/seo/redirects",
  "/admin/seo/robots",
  "/admin/seo/schema",
  "/admin/seo/sitemap",
  "/admin/settings",
  "/admin/submissions",
  "/admin/submissions/spam",
  "/admin/translations",
  "/admin/users",
];

// The MFA pages render only for a session that has given the password but not
// yet the second factor, and each needs a different kind of account.
export const MFA_ENROL_ROUTES = ["/admin/mfa/enrol"];
export const MFA_VERIFY_ROUTES = ["/admin/mfa/verify"];

// Every remaining route is a detail page keyed by an id.
export type Fixtures = {
  postId: string;
  jobId: string;
  applicationId: string;
  submissionId: string;
  auditId: string;
  cleanup: () => Promise<void>;
};

export function detailRoutes(f: Fixtures): string[] {
  return [
    `/admin/posts/${f.postId}`,
    `/admin/posts/${f.postId}/revisions`,
    `/admin/jobs/${f.jobId}`,
    `/admin/jobs/${f.jobId}/applications`,
    `/admin/applications/${f.applicationId}`,
    `/admin/submissions/${f.submissionId}`,
    `/admin/seo/audit/${f.auditId}`,
  ];
}

export function allShellRoutes(f: Fixtures): string[] {
  return [...SHELL_ROUTES, ...detailRoutes(f)];
}

// Everything the sweep claims to cover, for the inventory check.
export function coveredRoutes(): string[] {
  return [
    ...PUBLIC_ADMIN_ROUTES,
    ...SHELL_ROUTES,
    ...MFA_ENROL_ROUTES,
    ...MFA_VERIFY_ROUTES,
    "/admin/posts/[id]",
    "/admin/posts/[id]/revisions",
    "/admin/jobs/[id]",
    "/admin/jobs/[id]/applications",
    "/admin/applications/[id]",
    "/admin/submissions/[id]",
    "/admin/seo/audit/[id]",
  ];
}

async function post(request: APIRequestContext, baseURL: string, csrf: string, path: string, data: unknown) {
  const res = await request.post(`${baseURL}${path}`, {
    headers: { "x-csrf-token": csrf, "content-type": "application/json", origin: baseURL },
    data: data as Record<string, unknown>,
  });
  if (!res.ok()) throw new Error(`${path} answered ${res.status()}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

// Creates one row for each detail route through the same endpoints the console
// uses, so a fixture that stops working means a real endpoint stopped working.
export async function makeFixtures(request: APIRequestContext, baseURL: string, csrf: string, tag: string): Promise<Fixtures> {
  const created = await post(request, baseURL, csrf, "/api/admin/posts/create", {
    type: "blog",
    title: `Polish sweep ${tag}`,
    slug: `polish-sweep-${tag}`,
    status: "draft",
    bodyMd: "First version of the body, so the revision list has something to show.",
  });
  const postId = String(created.id);
  await post(request, baseURL, csrf, "/api/admin/posts/update", {
    id: postId,
    type: "blog",
    title: `Polish sweep ${tag}`,
    slug: `polish-sweep-${tag}`,
    status: "draft",
    bodyMd: "Second version, which is what makes a revision row exist.",
  });

  const job = await post(request, baseURL, csrf, "/api/admin/jobs/create", {
    slug: `polish-sweep-${tag}`,
    title: `Polish Sweep Engineer ${tag}`,
    department: "Engineering",
    location: "London",
    officeCode: "UK",
    employmentType: "full-time",
    seniority: "mid",
    remotePolicy: "hybrid",
    salaryCurrency: "GBP",
    salaryPeriod: "year",
    hideSalary: true,
    summaryMd: "A role created only so the job detail pages have something to render.",
    responsibilitiesMd: "Ship the thing.",
    requirementsMd: "Have shipped a thing.",
    benefitsMd: "",
    status: "draft",
  });
  const jobId = String(job.id);

  const app = await db().query<{ id: string }>(
    `insert into applications (job_id, name, email, phone, location, cover_note, stage)
     values ($1, $2, $3, $4, $5, $6, 'new') returning id`,
    [jobId, "Polish Sweep Applicant", `polish-${tag}@example.com`, "+44 20 7946 0000", "London", "A short cover note."],
  );
  const applicationId = app.rows[0].id;

  const sub = await db().query<{ id: string }>(`select id from submissions order by created_at desc limit 1`);
  if (sub.rows.length === 0) throw new Error("no submission rows to open a detail page with");
  const submissionId = sub.rows[0].id;

  const audit = await post(request, baseURL, csrf, "/api/admin/seo/audit/run", {});
  const auditId = String(audit.id);

  return {
    postId,
    jobId,
    applicationId,
    submissionId,
    auditId,
    cleanup: async () => {
      await db().query(`delete from applications where job_id = $1`, [jobId]);
      await db().query(`delete from jobs where id = $1`, [jobId]);
      await db().query(`delete from post_revisions where post_id = $1`, [postId]);
      await db().query(`delete from posts where id = $1`, [postId]);
      await db().query(`delete from seo_audit_findings where audit_id = $1`, [auditId]);
      await db().query(`delete from seo_audits where id = $1`, [auditId]);
    },
  };
}
