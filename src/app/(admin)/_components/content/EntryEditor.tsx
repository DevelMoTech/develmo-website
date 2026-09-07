"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EntryRow } from "@/lib/admin/content";
import type { ContentEntity } from "@/lib/schemas/content";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

// Field descriptors, so each entity gets a form that matches its type
// exactly. `optional` fields stay absent when left empty, which is what keeps
// the shapes the detail pages guard on intact.
type FieldKind = "text" | "textarea" | "list" | "titleBody" | "faq" | "select";
export type Field = { name: string; label: string; kind: FieldKind; help?: string; optional?: boolean; options?: string[] };

export const FIELDS: Record<ContentEntity, Field[]> = {
  pillar: [
    { name: "key", label: "Key", kind: "text", help: "Used in URLs and to group services. Lowercase with hyphens." },
    { name: "title", label: "Title", kind: "text" },
    { name: "icon", label: "Icon", kind: "text" },
    { name: "blurb", label: "Blurb", kind: "textarea" },
  ],
  service: [
    { name: "slug", label: "Slug", kind: "text", help: "The URL segment under /what-we-do." },
    { name: "pillar", label: "Pillar key", kind: "text" },
    { name: "title", label: "Title", kind: "text" },
    { name: "blurb", label: "Blurb", kind: "textarea" },
    { name: "intro", label: "Intro", kind: "textarea" },
    { name: "capabilities", label: "Capabilities", kind: "list" },
    { name: "tech", label: "Technologies", kind: "list" },
    { name: "outcomes", label: "Outcomes", kind: "titleBody", optional: true, help: "Optional. Rendered only when present." },
    { name: "faqs", label: "FAQs", kind: "faq", optional: true, help: "Optional. These become the page's FAQPage structured data, so every entry needs both halves." },
  ],
  industry: [
    { name: "slug", label: "Slug", kind: "text" },
    { name: "name", label: "Name", kind: "text" },
    { name: "icon", label: "Icon", kind: "text" },
    { name: "blurb", label: "Blurb", kind: "textarea" },
    { name: "challenge", label: "Challenge", kind: "textarea" },
    { name: "approach", label: "Approach", kind: "textarea", optional: true },
    { name: "solutions", label: "Solutions", kind: "list" },
    { name: "outcomes", label: "Outcomes", kind: "titleBody", optional: true },
    { name: "faqs", label: "FAQs", kind: "faq", optional: true, help: "Optional. These become the page's FAQPage structured data." },
  ],
  product: [
    { name: "slug", label: "Slug", kind: "text" },
    { name: "title", label: "Title", kind: "text" },
    { name: "tagline", label: "Tagline", kind: "textarea" },
    { name: "summary", label: "Summary", kind: "textarea" },
    { name: "initial", label: "Initial", kind: "text", help: "The single letter shown on the product tile." },
    { name: "bg", label: "Background", kind: "text" },
    { name: "fg", label: "Foreground", kind: "text" },
    { name: "badge", label: "Badge", kind: "select", options: ["live", "soon"] },
    { name: "href", label: "Link", kind: "text" },
    { name: "features", label: "Features", kind: "list" },
    { name: "stats", label: "Stats", kind: "list", optional: true },
    { name: "forWho", label: "Who it is for", kind: "textarea", optional: true },
    { name: "intro", label: "Intro", kind: "textarea", optional: true },
    { name: "howItWorks", label: "How it works", kind: "titleBody", optional: true },
    { name: "faqs", label: "FAQs", kind: "faq", optional: true, help: "Optional. These become the page's FAQPage structured data." },
  ],
  about: [
    { name: "heading", label: "Heading", kind: "text" },
    { name: "lead", label: "Lead", kind: "textarea" },
    { name: "vision", label: "Vision", kind: "textarea" },
    { name: "mission", label: "Mission", kind: "textarea" },
    { name: "story", label: "Story paragraphs", kind: "list" },
    { name: "values", label: "Values", kind: "titleBody" },
    { name: "differentiators", label: "Differentiators", kind: "titleBody" },
  ],
};

type Draft = Record<string, unknown>;

function ListField({ id, label, help, value, onChange, disabled, error }: { id: string; label: string; help?: string; value: string[]; onChange: (v: string[]) => void; disabled: boolean; error?: string }) {
  return (
    <div className="adm-field">
      <label className="adm-label" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="adm-input"
        rows={Math.min(12, Math.max(3, value.length + 1))}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
      />
      {error && <p className="adm-error">{error}</p>}
      <p className="adm-help">{help ?? "One per line. Blank lines are dropped."}</p>
    </div>
  );
}

function PairField({ name, label, help, keys, value, onChange, disabled, error }: { name: string; label: string; help?: string; keys: [string, string]; value: Record<string, string>[]; onChange: (v: Record<string, string>[]) => void; disabled: boolean; error?: string }) {
  const [a, b] = keys;
  const set = (i: number, k: string, v: string) => onChange(value.map((row, j) => (i === j ? { ...row, [k]: v } : row)));
  return (
    <div className="adm-field">
      <span className="adm-label">{label}</span>
      {value.map((row, i) => (
        <div className="adm-form-row" key={`${name}-${i}`} style={{ alignItems: "start" }}>
          <Input id={`${name}-${i}-${a}`} label={a === "q" ? "Question" : "Title"} value={row[a] ?? ""} onChange={(e) => set(i, a, e.target.value)} disabled={disabled} />
          <Textarea id={`${name}-${i}-${b}`} label={b === "a" ? "Answer" : "Body"} rows={3} value={row[b] ?? ""} onChange={(e) => set(i, b, e.target.value)} disabled={disabled} />
          <div className="adm-actions">
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        </div>
      ))}
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-actions">
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([...value, { [a]: "", [b]: "" }])}>Add</Button>
        {value.length > 0 && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange([])}>Remove all</Button>}
      </div>
      <p className="adm-help">{help ?? "Optional. Leave empty to omit the section entirely."}</p>
    </div>
  );
}

// pathPrefix is a string rather than a function: props cross the server to
// client boundary as data, and a function cannot be serialised.
export function EntryEditor({ entity, entries, csrf, canWrite, pathPrefix }: { entity: ContentEntity; entries: EntryRow[]; csrf: string; canWrite: boolean; pathPrefix?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState(entries[0]?.key ?? "");
  const current = useMemo(() => entries.find((e) => e.key === selected) ?? null, [entries, selected]);
  const [draft, setDraft] = useState<Draft>(current?.data ?? {});
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  function pick(key: string) {
    const row = entries.find((e) => e.key === key);
    setSelected(key);
    setDraft(row?.data ?? {});
    setIssues({});
    setDirty(false);
  }

  const set = (name: string, v: unknown) => {
    setDraft((d) => ({ ...d, [name]: v }));
    setDirty(true);
  };

  async function save() {
    if (!current) return;
    setPending(true);
    setIssues({});
    // Optional fields that were emptied are removed rather than sent as an
    // empty array, so the shape stays exactly as the type declares it.
    const payload: Draft = {};
    for (const field of FIELDS[entity]) {
      const v = draft[field.name];
      if (field.kind === "list") {
        const list = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
        if (field.optional && list.length === 0) continue;
        payload[field.name] = list;
      } else if (field.kind === "titleBody" || field.kind === "faq") {
        const rows = Array.isArray(v) ? (v as Record<string, string>[]).filter((r) => Object.values(r).some((x) => String(x).trim())) : [];
        if (field.optional && rows.length === 0) continue;
        payload[field.name] = rows;
      } else {
        const s = typeof v === "string" ? v.trim() : v;
        if (field.optional && (s === "" || s === undefined)) continue;
        payload[field.name] = s;
      }
    }
    const res = await apiPost("/api/admin/content/entry", { entity, key: current.key, data: payload }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Saved", body: "The public page picks it up on the next request." });
      setDirty(false);
      router.refresh();
      return;
    }
    const raw = res.data as { issues?: { path: string; message: string }[] };
    if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path.split(".")[0], i.message])));
    toast({ kind: "error", title: "Not saved", body: raw.issues?.length ? "Fix the highlighted fields." : describeError(res.status, res.data.error) });
  }

  if (entries.length === 0) return <Card title="Nothing to edit" description="No entries were found for this type." />;

  return (
    <div className="adm-split">
      <div>
        <TableFrame>
          <div className="adm-table-wrap" tabIndex={0}>
            <table className="adm-table">
              <caption className="adm-sr">Entries</caption>
              <thead><tr><th scope="col">Entry</th><th scope="col"><span className="adm-sr">Actions</span></th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.key}>
                    <td data-label="Entry">
                      <div className="adm-seo-path">{e.key}</div>
                      {e.fromFile && <Badge tone="muted">from the file</Badge>}
                    </td>
                    <td data-label="Actions" className="adm-td-actions">
                      <Button size="sm" variant={selected === e.key ? "primary" : "ghost"} onClick={() => pick(e.key)}>{selected === e.key ? "Editing" : "Edit"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFrame>
      </div>

      {current && (
        <Card
          title={current.key}
          description={current.fromFile ? "This type has not been seeded into the database yet; saving writes the first row." : undefined}
          actions={pathPrefix ? <a className="adm-btn adm-btn-ghost adm-btn-sm" href={`${pathPrefix}${current.key}`} target="_blank" rel="noreferrer">View page</a> : undefined}
        >
          <form className="adm-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            {FIELDS[entity].map((field) => {
              const v = draft[field.name];
              const error = issues[field.name];
              if (field.kind === "list") return <ListField key={field.name} id={`f-${field.name}`} label={field.label} help={field.help} value={Array.isArray(v) ? (v as string[]) : []} onChange={(next) => set(field.name, next)} disabled={!canWrite || pending} error={error} />;
              if (field.kind === "titleBody") return <PairField key={field.name} name={field.name} label={field.label} help={field.help} keys={["title", "body"]} value={Array.isArray(v) ? (v as Record<string, string>[]) : []} onChange={(next) => set(field.name, next)} disabled={!canWrite || pending} error={error} />;
              if (field.kind === "faq") return <PairField key={field.name} name={field.name} label={field.label} help={field.help} keys={["q", "a"]} value={Array.isArray(v) ? (v as Record<string, string>[]) : []} onChange={(next) => set(field.name, next)} disabled={!canWrite || pending} error={error} />;
              if (field.kind === "select") {
                return (
                  <div className="adm-field" key={field.name}>
                    <label className="adm-label" htmlFor={`f-${field.name}`}>{field.label}</label>
                    <select id={`f-${field.name}`} className="adm-input adm-select" value={String(v ?? "")} onChange={(e) => set(field.name, e.target.value)} disabled={!canWrite || pending}>
                      {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {error && <p className="adm-error">{error}</p>}
                  </div>
                );
              }
              if (field.kind === "textarea") return <Textarea key={field.name} id={`f-${field.name}`} label={field.label} help={field.help} rows={4} value={String(v ?? "")} onChange={(e) => set(field.name, e.target.value)} disabled={!canWrite || pending} error={error} />;
              return <Input key={field.name} id={`f-${field.name}`} label={field.label} help={field.help} value={String(v ?? "")} onChange={(e) => set(field.name, e.target.value)} disabled={!canWrite || pending} error={error} />;
            })}
            {Object.keys(issues).length > 0 && <Alert kind="error">The highlighted fields do not match the shape the public pages expect.</Alert>}
            {canWrite && (
              <div className="adm-actions">
                <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save"}</Button>
              </div>
            )}
          </form>
        </Card>
      )}
    </div>
  );
}
