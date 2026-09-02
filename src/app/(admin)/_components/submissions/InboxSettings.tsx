"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReplyTemplate, Retention } from "@/lib/admin/settings";
import { apiPost, describeError } from "../api-client";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { useToast } from "../ui/Toast";

// Retention windows (brief §3.5): the cron hard-deletes rows older than
// these. Zero keeps rows forever.
export function RetentionForm({ csrf, initial }: { csrf: string; initial: Retention }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState({ submissionsMonths: String(initial.submissionsMonths), applicationsMonths: String(initial.applicationsMonths) });
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = value.submissionsMonths !== String(initial.submissionsMonths) || value.applicationsMonths !== String(initial.applicationsMonths);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // A blank field is not "keep forever"; that has to be typed as 0.
    const blank: Record<string, string> = {};
    if (!/^\d+$/.test(value.submissionsMonths.trim())) blank.submissionsMonths = "Enter a whole number of months (0 keeps them forever)";
    if (!/^\d+$/.test(value.applicationsMonths.trim())) blank.applicationsMonths = "Enter a whole number of months (0 keeps them forever)";
    if (Object.keys(blank).length) {
      setIssues(blank);
      return;
    }
    setPending(true);
    setIssues({});
    const res = await apiPost("/api/admin/settings/retention", { submissionsMonths: Number(value.submissionsMonths), applicationsMonths: Number(value.applicationsMonths) }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Retention saved", body: "Applied by the next cron run." });
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
    }
  }

  return (
    <form className="adm-form" onSubmit={save} noValidate>
      <div className="adm-form-row">
        <Input id="ret-sub" label="Keep enquiries for (months)" type="number" min={0} max={120} step={1} inputMode="numeric" value={value.submissionsMonths} onChange={(e) => setValue({ ...value, submissionsMonths: e.target.value })} error={issues.submissionsMonths} help="0 keeps them forever. Default 24." disabled={pending} />
        <Input id="ret-app" label="Keep applications and CVs for (months)" type="number" min={0} max={120} step={1} inputMode="numeric" value={value.applicationsMonths} onChange={(e) => setValue({ ...value, applicationsMonths: e.target.value })} error={issues.applicationsMonths} help="0 keeps them forever. Default 24." disabled={pending} />
      </div>
      <p className="adm-help">IP addresses are stored only as a salted hash, for abuse prevention (rate limiting and spam review), never in the clear.</p>
      <div className="adm-actions">
        <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save retention"}</Button>
      </div>
    </form>
  );
}

// The mailto: reply template. Placeholders: {{first_name}}, {{name}},
// {{company}}, {{service}}, {{message}}.
export function ReplyTemplateForm({ csrf, initial }: { csrf: string; initial: ReplyTemplate }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = value.subject !== initial.subject || value.body !== initial.body;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setIssues({});
    const res = await apiPost("/api/admin/settings/reply-template", value, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Reply template saved" });
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
    }
  }

  return (
    <form className="adm-form" onSubmit={save} noValidate>
      <Input id="rt-subject" label="Subject" value={value.subject} onChange={(e) => setValue({ ...value, subject: e.target.value })} maxLength={200} error={issues.subject} disabled={pending} />
      <Textarea id="rt-body" label="Body" rows={7} value={value.body} onChange={(e) => setValue({ ...value, body: e.target.value })} maxLength={4000} error={issues.body} disabled={pending} help="Placeholders: {{first_name}}, {{name}}, {{company}}, {{service}}, {{message}}. Opens in your mail app with these filled in." />
      <div className="adm-actions">
        <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save template"}</Button>
      </div>
    </form>
  );
}
