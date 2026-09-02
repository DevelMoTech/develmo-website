"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobPostingReport } from "@/lib/jobposting";
import { CURRENCIES, EMPLOYMENT_TYPES, OFFICES, REMOTE_POLICIES, SALARY_PERIODS, SENIORITIES, type JobStatus } from "@/lib/jobs-shared";
import { slugify } from "@/lib/slug";
import type { JobEditorValue } from "../../_lib/job-editor-data";
import { useIsClient } from "../../_lib/useIsClient";
import { useUnsavedChanges } from "../../_lib/useUnsavedChanges";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button, ButtonLink } from "../ui/Button";
import { Input, Select, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { MarkdownField } from "../ui/MarkdownField";
import { ConfirmDialog } from "../ui/Modal";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

type SlugResult = { slug: string; status: "ok" | "taken" | "invalid"; suggestion?: string };

export function JobEditor({
  csrf,
  jobId,
  initial,
  savedSlug,
  canWrite,
  applicationCount,
  report,
}: {
  csrf: string;
  jobId: string | null;
  initial: JobEditorValue;
  savedSlug: string | null;
  canWrite: boolean;
  applicationCount: number;
  // JobPosting validation for the saved row, shown so gaps get fixed.
  report: JobPostingReport | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const isClient = useIsClient();
  const [value, setValue] = useState<JobEditorValue>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(value) !== saved;
  useUnsavedChanges(dirty && canWrite);
  const [slugTouched, setSlugTouched] = useState(initial.slug !== "" && initial.slug !== slugify(initial.title));
  const [slugResult, setSlugResult] = useState<SlugResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = useCallback(<K extends keyof JobEditorValue>(key: K, v: JobEditorValue[K]) => setValue((cur) => ({ ...cur, [key]: v })), []);

  const slugUnchanged = value.slug === savedSlug;
  const slugAnswer = slugResult && slugResult.slug === value.slug ? slugResult : null;
  const slugStatus: "idle" | "checking" | "ok" | "taken" | "invalid" = !value.slug ? "idle" : slugUnchanged ? "ok" : slugAnswer ? slugAnswer.status : "checking";
  useEffect(() => {
    const slug = value.slug;
    if (!slug || slugUnchanged) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = new URLSearchParams({ slug });
        if (jobId) sp.set("exclude", jobId);
        const res = await fetch(`/api/admin/jobs/slug-check?${sp}`, { signal: ctrl.signal, credentials: "same-origin" });
        const data = (await res.json()) as { ok: boolean; available?: boolean; suggestion?: string };
        setSlugResult(data.ok ? { slug, status: data.available ? "ok" : "taken", suggestion: data.suggestion } : { slug, status: "invalid" });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSlugResult({ slug, status: "invalid" });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value.slug, jobId, slugUnchanged]);

  const save = useCallback(async () => {
    if (pending || !canWrite) return;
    setPending(true);
    setError(null);
    setIssues({});
    const body = { ...value, salaryMin: value.salaryMin === "" ? null : Number(value.salaryMin), salaryMax: value.salaryMax === "" ? null : Number(value.salaryMax) };
    const res = jobId ? await apiPost("/api/admin/jobs/update", { ...body, id: jobId }, csrf) : await apiPost<{ id: string }>("/api/admin/jobs/create", body, csrf);
    setPending(false);
    if (!res.data.ok) {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      setError(res.data.error === "slug_taken" ? "That slug is already in use. Pick another." : describeError(res.status, res.data.error, res.data.retryAfter));
      toast({ kind: "error", title: "Not saved" });
      return;
    }
    setSaved(JSON.stringify(value));
    if (!jobId) {
      toast({ kind: "success", title: "Job created", body: value.status === "open" ? "It is live on the careers page." : undefined });
      router.replace(`/admin/jobs/${(res.data as { id: string }).id}`);
      return;
    }
    toast({ kind: "success", title: "Saved", body: value.status === "open" ? "The careers page was revalidated." : undefined });
    router.refresh();
  }, [pending, canWrite, value, jobId, csrf, router, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save]);

  async function remove() {
    if (!jobId) return;
    setPending(true);
    const res = await apiPost("/api/admin/jobs/delete", { id: jobId }, csrf);
    setPending(false);
    if (res.data.ok) {
      setSaved(JSON.stringify(value));
      toast({ kind: "success", title: "Job deleted" });
      router.push("/admin/jobs");
    } else {
      setConfirmDelete(false);
      toast({ kind: "error", title: "Not deleted", body: res.data.error === "has_applications" ? "This job has applications. Close it instead so the pipeline history is kept." : describeError(res.status, res.data.error) });
    }
  }

  const disabled = !canWrite || pending;
  const publicPath = `/jobs/${value.slug || "…"}`;

  return (
    <form
      className="adm-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <div className="adm-editor-main">
        {error && <Alert kind="error">{error}</Alert>}
        {!canWrite && <Alert kind="info">You can read this job but your role cannot change it.</Alert>}
        {report && report.errors.length > 0 && (
          <Alert kind="warn">
            <p>JobPosting structured data is not emitted for this role until these are fixed:</p>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {report.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
        {report && report.errors.length === 0 && report.warnings.length > 0 && (
          <Alert kind="info">
            <p>JobPosting structured data is valid. Recommended additions:</p>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        {report && report.errors.length === 0 && report.warnings.length === 0 && <Alert kind="success">JobPosting structured data is valid and complete.</Alert>}

        <Card title="Role">
          <div className="adm-form">
            <Input id="j-title" label="Title" required maxLength={160} value={value.title} onChange={(e) => setValue((cur) => ({ ...cur, title: e.target.value, slug: slugTouched ? cur.slug : slugify(e.target.value) }))} error={issues.title} disabled={disabled} />
            <div className="adm-field">
              <label className="adm-label" htmlFor="j-slug">Slug</label>
              <div className="adm-slug-row">
                <span className="adm-slug-base adm-mono">/jobs/</span>
                <input id="j-slug" className="adm-input adm-mono" value={value.slug} maxLength={120} aria-invalid={issues.slug || slugStatus === "taken" || slugStatus === "invalid" ? "true" : undefined} aria-describedby="j-slug-status" onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} onBlur={() => set("slug", slugify(value.slug))} disabled={disabled} />
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { setSlugTouched(false); set("slug", slugify(value.title)); }}>From title</Button>
              </div>
              <p id="j-slug-status" className={slugStatus === "taken" || slugStatus === "invalid" || issues.slug ? "adm-error" : "adm-help"} aria-live="polite">
                {issues.slug ?? (slugStatus === "idle" ? "Lowercase letters, numbers and hyphens." : slugStatus === "checking" ? "Checking availability" : slugStatus === "ok" ? `Available: ${publicPath}` : slugStatus === "invalid" ? "Lowercase letters, numbers and single hyphens only." : `Already used. Try ${slugAnswer?.suggestion}`)}
                {slugStatus === "taken" && slugAnswer?.suggestion && (
                  <>
                    {" "}
                    <button type="button" className="adm-link" onClick={() => { setSlugTouched(true); set("slug", slugAnswer.suggestion!); }}>Use it</button>
                  </>
                )}
              </p>
            </div>
            <div className="adm-form-row">
              <Input id="j-department" label="Department" maxLength={80} value={value.department} onChange={(e) => set("department", e.target.value)} error={issues.department} disabled={disabled} placeholder="Engineering" />
              <Select id="j-office" label="Office" options={[{ value: "", label: "No office" }, ...OFFICES.map((o) => ({ value: o.code, label: o.name }))]} value={value.officeCode ?? ""} onChange={(e) => set("officeCode", e.target.value || null)} error={issues.officeCode} disabled={disabled} help="Sets the country in the JobPosting location." />
              <Input id="j-location" label="City or area" maxLength={120} value={value.location} onChange={(e) => set("location", e.target.value)} error={issues.location} disabled={disabled} placeholder="London" />
            </div>
            <div className="adm-form-row">
              <Select id="j-type" label="Employment type" options={EMPLOYMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={value.employmentType} onChange={(e) => set("employmentType", e.target.value)} disabled={disabled} />
              <Select id="j-seniority" label="Seniority" options={SENIORITIES.map((s) => ({ value: s.value, label: s.label }))} value={value.seniority} onChange={(e) => set("seniority", e.target.value)} disabled={disabled} />
              <Select id="j-remote" label="Work arrangement" options={REMOTE_POLICIES.map((r) => ({ value: r.value, label: r.label }))} value={value.remotePolicy} onChange={(e) => set("remotePolicy", e.target.value)} disabled={disabled} />
            </div>
            <MarkdownField id="j-summary" label="Summary" value={value.summaryMd} onChange={(v) => set("summaryMd", v)} csrf={csrf} error={issues.summaryMd} disabled={disabled} rows={6} help="Shown at the top of the role page and, in plain text, on the careers page card. At least 50 characters for valid structured data." />
            <MarkdownField id="j-responsibilities" label="Responsibilities" value={value.responsibilitiesMd} onChange={(v) => set("responsibilitiesMd", v)} csrf={csrf} error={issues.responsibilitiesMd} disabled={disabled} />
            <MarkdownField id="j-requirements" label="Requirements" value={value.requirementsMd} onChange={(v) => set("requirementsMd", v)} csrf={csrf} error={issues.requirementsMd} disabled={disabled} />
            <MarkdownField id="j-benefits" label="Benefits" value={value.benefitsMd} onChange={(v) => set("benefitsMd", v)} csrf={csrf} error={issues.benefitsMd} disabled={disabled} />
          </div>
        </Card>

        <Card title="Salary">
          <div className="adm-form">
            <div className="adm-form-row">
              <Input id="j-salary-min" label="Minimum" type="number" inputMode="numeric" min={0} step={1} value={value.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} error={issues.salaryMin} disabled={disabled} />
              <Input id="j-salary-max" label="Maximum" type="number" inputMode="numeric" min={0} step={1} value={value.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} error={issues.salaryMax} disabled={disabled} />
              <Select id="j-currency" label="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={value.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value)} disabled={disabled} />
              <Select id="j-period" label="Period" options={SALARY_PERIODS.map((p) => ({ value: p.value, label: p.label }))} value={value.salaryPeriod} onChange={(e) => set("salaryPeriod", e.target.value)} disabled={disabled} />
            </div>
            <Toggle id="j-hide-salary" checked={value.hideSalary} onChange={(v) => set("hideSalary", v)} label="Hide the salary on the public page and in structured data" disabled={disabled} />
          </div>
        </Card>

        <Card title="Search and sharing" description="Leave blank to use the title and the first sentences of the summary.">
          <div className="adm-form">
            <Input id="j-meta-title" label="Meta title" help={`${value.metaTitle.length}/60 recommended`} maxLength={200} value={value.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} error={issues.metaTitle} disabled={disabled} />
            <Textarea id="j-meta-desc" label="Meta description" help={`${value.metaDescription.length}/155 recommended`} rows={2} maxLength={320} value={value.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} error={issues.metaDescription} disabled={disabled} />
            <Input id="j-canonical" label="Canonical override" help="An https URL or a site path. Only when this role is also posted elsewhere as the original." value={value.canonicalOverride} onChange={(e) => set("canonicalOverride", e.target.value)} error={issues.canonicalOverride} disabled={disabled} placeholder={publicPath} />
            <Toggle id="j-noindex" checked={value.noindex} onChange={(v) => set("noindex", v)} label="Hide from search engines (noindex)" disabled={disabled} />
          </div>
        </Card>
      </div>

      <aside className="adm-editor-side">
        <Card title="Publishing">
          <div className="adm-form">
            <Select id="j-status" label="Status" options={STATUS_OPTIONS} value={value.status} onChange={(e) => set("status", e.target.value as JobStatus)} error={issues.status} disabled={disabled} help={value.status === "open" ? "Listed on /jobs and accepting applications." : value.status === "paused" ? "Hidden from /jobs; the page returns 404 while paused." : value.status === "closed" ? "Hidden from /jobs; the page returns 404." : "Not public."} />
            <Input id="j-opens" type="datetime-local" label="Opens at" help="Optional. An open role before this time is not yet listed." value={isClient ? toLocalInput(value.opensAt) : ""} onChange={(e) => set("opensAt", e.target.value ? new Date(e.target.value).toISOString() : null)} error={issues.opensAt} disabled={disabled} />
            <Input id="j-closes" type="datetime-local" label="Closes at" help="Optional. Shown as the closing date; the role leaves /jobs at this time and is marked closed by the cron." value={isClient ? toLocalInput(value.closesAt) : ""} onChange={(e) => set("closesAt", e.target.value ? new Date(e.target.value).toISOString() : null)} error={issues.closesAt} disabled={disabled} />
            <div className="adm-actions">
              <Button type="submit" disabled={disabled || slugStatus === "taken"}>{pending ? "Saving" : jobId ? "Save" : "Create job"}</Button>
              {jobId && (
                <ButtonLink href={`/admin/jobs/${jobId}/applications`} variant="ghost">
                  <Icon name="applications" size={18} /> Applications ({applicationCount})
                </ButtonLink>
              )}
            </div>
            {dirty && canWrite && <p className="adm-help">Unsaved changes. Ctrl+S saves.</p>}
          </div>
        </Card>

        {jobId && canWrite && (
          <Card title="Danger zone">
            <p>{applicationCount > 0 ? `This job has ${applicationCount} application${applicationCount === 1 ? "" : "s"}, so it cannot be deleted. Close it instead.` : "Deleting removes the job. The audit trail is kept."}</p>
            <div className="adm-actions" style={{ marginBlockStart: 12 }}>
              <Button variant="danger" size="sm" disabled={pending || applicationCount > 0} onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete job</Button>
            </div>
          </Card>
        )}
      </aside>

      <ConfirmDialog
        key={confirmDelete ? "open" : "closed"}
        id="delete-job"
        open={confirmDelete}
        title={`Delete "${value.title || "this job"}"?`}
        body="This cannot be undone. Type the slug to confirm."
        confirmLabel="Delete job"
        typed={savedSlug ?? value.slug}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}
