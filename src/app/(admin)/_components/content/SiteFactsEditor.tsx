"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteFactsInput } from "@/lib/schemas/content";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { useToast } from "../ui/Toast";

type Stat = { value: string; label: string };

export function SiteFactsEditor({ facts, stats, tech, fromFile, csrf, canWrite }: { facts: SiteFactsInput; stats: Stat[]; tech: string[]; fromFile: boolean; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<SiteFactsInput>(facts);
  const [s, setS] = useState<Stat[]>(stats);
  const [tx, setTx] = useState<string[]>(tech);
  const [pending, setPending] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const set = <K extends keyof SiteFactsInput>(k: K, v: SiteFactsInput[K]) => setF((prev) => ({ ...prev, [k]: v }));

  async function submit(endpoint: string, value: unknown, label: string) {
    setPending(label);
    setIssues({});
    const res = await apiPost(`/api/admin/content/${endpoint}`, endpoint === "site" ? (value as Record<string, unknown>) : { value }, csrf);
    setPending(null);
    if (res.data.ok) {
      toast({ kind: "success", title: `${label} saved`, body: "Live on the public site on the next request." });
      router.refresh();
      return;
    }
    const raw = res.data as { issues?: { path: string; message: string }[] };
    if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
    toast({ kind: "error", title: `${label} not saved`, body: raw.issues?.length ? "Fix the highlighted fields." : describeError(res.status, res.data.error) });
  }

  return (
    <>
      {fromFile && <Alert kind="info" live={false}>These values are still coming from src/lib/site.ts. Saving writes the first database row; the file stays as the fallback.</Alert>}

      <Card title="Company" description="The name, contact details and description used across the site and in the Organization structured data.">
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void submit("site", { value: { ...f, phones: f.phones.filter(Boolean) } }, "Company facts"); }} noValidate>
          <div className="adm-form-row">
            <Input id="sf-name" label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} disabled={!canWrite || !!pending} error={issues["value.name"]} />
            <Input id="sf-url" label="Site URL" value={f.url} onChange={(e) => set("url", e.target.value)} disabled={!canWrite || !!pending} error={issues["value.url"]} />
            <Input id="sf-email" label="Email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={!canWrite || !!pending} error={issues["value.email"]} />
          </div>
          <Input id="sf-tagline" label="Tagline" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} disabled={!canWrite || !!pending} error={issues["value.tagline"]} />
          <Textarea id="sf-description" label="Description" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={!canWrite || !!pending} error={issues["value.description"]} help="Used as the default meta description and in the Organization JSON-LD." />
          <div className="adm-field">
            <label className="adm-label" htmlFor="sf-phones">Phone numbers</label>
            <textarea id="sf-phones" className="adm-input" rows={3} value={f.phones.join("\n")} onChange={(e) => set("phones", e.target.value.split("\n"))} disabled={!canWrite || !!pending} />
            <p className="adm-help">One per line.</p>
          </div>
          <div className="adm-form-row">
            <Input id="sf-line" label="Address" value={f.address.line} onChange={(e) => set("address", { ...f.address, line: e.target.value })} disabled={!canWrite || !!pending} />
            <Input id="sf-city" label="City" value={f.address.city} onChange={(e) => set("address", { ...f.address, city: e.target.value })} disabled={!canWrite || !!pending} />
            <Input id="sf-region" label="Region" value={f.address.region} onChange={(e) => set("address", { ...f.address, region: e.target.value })} disabled={!canWrite || !!pending} />
          </div>
          <div className="adm-form-row">
            <Input id="sf-postcode" label="Postcode" value={f.address.postcode} onChange={(e) => set("address", { ...f.address, postcode: e.target.value })} disabled={!canWrite || !!pending} />
            <Input id="sf-country" label="Country" value={f.address.country} onChange={(e) => set("address", { ...f.address, country: e.target.value })} disabled={!canWrite || !!pending} help="Translated on the public site, so keep it as the English name." />
          </div>

          <div className="adm-field">
            <span className="adm-label">Offices</span>
            {f.offices.map((o, i) => (
              <div className="adm-form-row" key={`office-${i}`} style={{ alignItems: "start" }}>
                <Input id={`sf-off-${i}-code`} label="Code" value={o.code} onChange={(e) => set("offices", f.offices.map((x, j) => (i === j ? { ...x, code: e.target.value } : x)))} disabled={!canWrite || !!pending} />
                <Input id={`sf-off-${i}-name`} label="Name" value={o.name} onChange={(e) => set("offices", f.offices.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))} disabled={!canWrite || !!pending} />
                <Textarea id={`sf-off-${i}-desc`} label="Description" rows={2} value={o.desc} onChange={(e) => set("offices", f.offices.map((x, j) => (i === j ? { ...x, desc: e.target.value } : x)))} disabled={!canWrite || !!pending} />
              </div>
            ))}
            <p className="adm-help">Office names and descriptions are translated on the public site. A new wording needs its translations adding under Translations, or it renders in English.</p>
          </div>

          <div className="adm-field">
            <span className="adm-label">Social profiles</span>
            {f.social.map((so, i) => (
              <div className="adm-form-row" key={`social-${i}`} style={{ alignItems: "start" }}>
                <Input id={`sf-so-${i}-name`} label="Name" value={so.name} onChange={(e) => set("social", f.social.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))} disabled={!canWrite || !!pending} />
                <Input id={`sf-so-${i}-href`} label="URL" value={so.href} onChange={(e) => set("social", f.social.map((x, j) => (i === j ? { ...x, href: e.target.value } : x)))} disabled={!canWrite || !!pending} />
                <Input id={`sf-so-${i}-icon`} label="Icon" value={so.icon} onChange={(e) => set("social", f.social.map((x, j) => (i === j ? { ...x, icon: e.target.value } : x)))} disabled={!canWrite || !!pending} />
              </div>
            ))}
            <p className="adm-help">These are the sameAs entries in the Organization structured data.</p>
          </div>

          {canWrite && <div className="adm-actions"><Button type="submit" size="sm" disabled={!!pending}>{pending === "Company facts" ? "Saving" : "Save company facts"}</Button></div>}
        </form>
      </Card>

      <Card title="Headline stats" description="The four figures on the home page and the about page.">
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void submit("stats", s, "Stats"); }} noValidate>
          {s.map((row, i) => (
            <div className="adm-form-row" key={`stat-${i}`}>
              <Input id={`st-${i}-value`} label="Value" value={row.value} onChange={(e) => setS(s.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)))} disabled={!canWrite || !!pending} />
              <Input id={`st-${i}-label`} label="Label" value={row.label} onChange={(e) => setS(s.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))} disabled={!canWrite || !!pending} />
            </div>
          ))}
          {canWrite && <div className="adm-actions"><Button type="submit" size="sm" disabled={!!pending}>{pending === "Stats" ? "Saving" : "Save stats"}</Button></div>}
        </form>
      </Card>

      <Card title="Technology list" description="The technologies named on the home page. Product and framework names are not translated.">
        <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void submit("tech", tx.map((x) => x.trim()).filter(Boolean), "Technologies"); }} noValidate>
          <div className="adm-field">
            <label className="adm-label" htmlFor="sf-tech">Technologies</label>
            <textarea id="sf-tech" className="adm-input" rows={8} value={tx.join("\n")} onChange={(e) => setTx(e.target.value.split("\n"))} disabled={!canWrite || !!pending} />
            <p className="adm-help">One per line.</p>
          </div>
          {canWrite && <div className="adm-actions"><Button type="submit" size="sm" disabled={!!pending}>{pending === "Technologies" ? "Saving" : "Save technologies"}</Button></div>}
        </form>
      </Card>
    </>
  );
}
