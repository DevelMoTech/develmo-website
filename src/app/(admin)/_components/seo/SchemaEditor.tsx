"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildOrganizationLd, DEFAULT_ORGANIZATION_FACTS, validateOrganizationLd, type OrganizationFacts } from "@/lib/seo/organization";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { TableFrame } from "../ui/TableFrame";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

type Form = Omit<OrganizationFacts, "telephone"> & { telephone: string };

const toForm = (f: OrganizationFacts): Form => ({ ...f, telephone: f.telephone.join(", ") });
const fromForm = (f: Form): OrganizationFacts => ({ ...f, telephone: f.telephone.split(",").map((s) => s.trim()).filter(Boolean) });

export function OrganizationEditor({ initial, csrf, canWrite, sameAs, siteUrl }: { initial: OrganizationFacts; csrf: string; canWrite: boolean; sameAs: { name: string; href: string }[]; siteUrl: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<Form>(toForm(initial));
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const facts = useMemo(() => fromForm(form), [form]);
  const ld = useMemo(() => buildOrganizationLd(facts), [facts]);
  const report = useMemo(() => validateOrganizationLd(ld), [ld]);
  const dirty = JSON.stringify(facts) !== JSON.stringify(initial);
  const isDefault = JSON.stringify(facts) === JSON.stringify(DEFAULT_ORGANIZATION_FACTS);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setIssues({});
    const res = await apiPost("/api/admin/seo/schema/save", facts, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Structured data saved", body: "Every public page emits it on the next request." });
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[]; errors?: string[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path.split(".")[0], i.message])));
      toast({ kind: "error", title: "Not saved", body: raw.errors?.[0] ?? describeError(res.status, res.data.error) });
    }
  }

  async function reset() {
    setPending(true);
    const res = await apiPost<{ facts: OrganizationFacts }>("/api/admin/seo/schema/reset", {}, csrf);
    setPending(false);
    if (res.data.ok) {
      setForm(toForm(res.data.facts));
      toast({ kind: "success", title: "Structured data reset", body: "Back to the facts in src/lib/site.ts." });
      router.refresh();
    } else toast({ kind: "error", title: "Not reset", body: describeError(res.status, res.data.error) });
  }

  return (
    <div className="adm-split" style={{ marginBlockEnd: 18 }}>
      <form className="adm-card adm-form" onSubmit={save} noValidate aria-labelledby="org-editor-title">
        <h2 id="org-editor-title" className="adm-card-head" style={{ margin: 0 }}>Organization facts</h2>
        <Input id="org-name" label="Name" value={form.name} onChange={set("name")} maxLength={120} error={issues.name} disabled={!canWrite || pending} />
        <Input id="org-email" label="Email" type="email" value={form.email} onChange={set("email")} maxLength={200} error={issues.email} disabled={!canWrite || pending} />
        <Textarea id="org-desc" label="Description" rows={3} value={form.description} onChange={set("description")} maxLength={5000} error={issues.description} disabled={!canWrite || pending} />
        <div className="adm-form-row">
          <Input id="org-street" label="Street address" value={form.streetAddress} onChange={set("streetAddress")} maxLength={200} error={issues.streetAddress} disabled={!canWrite || pending} />
          <Input id="org-city" label="City" value={form.addressLocality} onChange={set("addressLocality")} maxLength={100} error={issues.addressLocality} disabled={!canWrite || pending} />
        </div>
        <div className="adm-form-row">
          <Input id="org-postcode" label="Postcode" value={form.postalCode} onChange={set("postalCode")} maxLength={20} error={issues.postalCode} disabled={!canWrite || pending} />
          <Input id="org-country" label="Country code" value={form.addressCountry} onChange={set("addressCountry")} maxLength={56} error={issues.addressCountry} disabled={!canWrite || pending} help="Two letter ISO code, for example GB." />
        </div>
        <Input id="org-phones" label="Telephone numbers" value={form.telephone} onChange={set("telephone")} error={issues.telephone} disabled={!canWrite || pending} help="Comma separated, optional. Blank leaves telephone out of the markup." />
        <Input id="org-logo" label="Logo URL" value={form.logo} onChange={set("logo")} maxLength={500} error={issues.logo} disabled={!canWrite || pending} help="An https URL, optional. Blank leaves logo out of the markup." />
        <div className="adm-field">
          <span className="adm-label">Profiles (sameAs)</span>
          <ul className="adm-chips" style={{ margin: 0 }}>
            {sameAs.map((s) => <li key={s.href}><a className="adm-link" href={s.href} target="_blank" rel="noreferrer">{s.name}</a></li>)}
          </ul>
          <p className="adm-help">Always the real profiles from src/lib/site.ts; the url stays {siteUrl}.</p>
        </div>
        {report.errors.length > 0 && (
          <Alert kind="error">
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Alert>
        )}
        {report.errors.length === 0 && report.warnings.length > 0 && (
          <Alert kind="warn" live={false}>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Alert>
        )}
        {canWrite && (
          <div className="adm-actions">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending || isDefault}>Reset to site facts</Button>
            <Button type="submit" size="sm" disabled={pending || !dirty || report.errors.length > 0}>{pending ? "Saving" : "Save structured data"}</Button>
          </div>
        )}
      </form>
      <Card title="Emitted JSON-LD" description="Exactly what the site chrome writes into every public page, validated as you type.">
        <pre className="adm-pre" tabIndex={0} aria-label="Organization JSON-LD">{JSON.stringify(ld, null, 2)}</pre>
      </Card>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = { service: "Service", industry: "Industry", product: "Product" };

export function FaqToggles({ routes, csrf, canWrite }: { routes: { path: string; label: string; kind: string; enabled: boolean }[]; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(path: string, enabled: boolean) {
    setBusy(path);
    const res = await apiPost("/api/admin/seo/schema/faq", { path, enabled }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: enabled ? "FAQPage on" : "FAQPage off", body: `${path} changes on the next request.` });
      router.refresh();
    } else toast({ kind: "error", title: "Not changed", body: describeError(res.status, res.data.error) });
  }

  return (
    <Card title="FAQPage per detail page" description={`${routes.filter((r) => r.enabled).length} of ${routes.length} detail pages with FAQs emit FAQPage JSON-LD. Off keeps the visible FAQ section and drops only the markup.`}>
      <TableFrame>
        <div className="adm-table-wrap" tabIndex={0}>
          <table className="adm-table">
            <caption className="adm-sr">FAQPage structured data per detail page</caption>
            <thead>
              <tr><th scope="col">Route</th><th scope="col">Type</th><th scope="col">FAQPage</th></tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.path}>
                  <td data-label="Route">
                    <div className="adm-seo-path">{r.path}</div>
                    <div className="adm-muted" style={{ fontSize: 13 }}>{r.label}</div>
                  </td>
                  <td data-label="Type">{KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td data-label="FAQPage">
                    <Toggle id={`faq-${r.path.replace(/[^a-z0-9]+/gi, "-")}`} checked={r.enabled} onChange={(v) => toggle(r.path, v)} label={r.enabled ? "Emitted" : "Off"} disabled={!canWrite || busy === r.path} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableFrame>
    </Card>
  );
}
