"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrentMeta, RouteRow } from "@/lib/admin/seo";
import type { MediaView } from "@/lib/admin/media";
import { CHANGEFREQS, DESCRIPTION_LIMIT, TITLE_LIMIT } from "@/lib/schemas/seo";
import { apiPost, describeError } from "../api-client";
import { MediaPicker } from "../media/MediaPicker";
import { Alert, Badge } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Checkbox, Input, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const KIND_LABELS: Record<RouteRow["kind"], string> = { static: "Page", service: "Service", industry: "Industry", product: "Product", blog: "Blog post", kb: "Knowledge base", job: "Job" };

function flags(r: RouteRow): string[] {
  const o = r.override;
  if (!o) return [];
  const out: string[] = [];
  if (o.metaTitle) out.push("title");
  if (o.metaDescription) out.push("description");
  if (o.canonical) out.push("canonical");
  if (o.ogImage) out.push("image");
  if (o.noindex) out.push("noindex");
  if (o.nofollow) out.push("nofollow");
  if (o.sitemapInclude !== null || o.sitemapChangefreq || o.sitemapPriority !== null) out.push("sitemap");
  if (o.faqEnabled === false) out.push("FAQ off");
  return out;
}

export function Counter({ value, limit }: { value: string; limit: number }) {
  const n = value.length;
  return (
    <p className={["adm-counter", n > limit && "adm-counter-over"].filter(Boolean).join(" ")}>
      {n} / {limit} characters{n > limit ? ", over the practical limit" : ""}
    </p>
  );
}

export function SerpPreview({ siteUrl, path, title, description }: { siteUrl: string; path: string; title: string; description: string }) {
  const host = siteUrl.replace(/^https?:\/\//, "");
  const crumbs = path === "/" ? "" : path.split("/").filter(Boolean).join(" › ");
  return (
    <div className="adm-serp" aria-label="Search result preview">
      <div className="adm-serp-site">
        <span className="adm-serp-favicon" aria-hidden="true">D</span>
        <span className="adm-serp-url">{host}{crumbs ? ` › ${crumbs}` : ""}</span>
      </div>
      <h3 className="adm-serp-title">{title.length > 70 ? `${title.slice(0, 67)}...` : title}</h3>
      <p className="adm-serp-desc">{description.length > 160 ? `${description.slice(0, 157)}...` : description}</p>
    </div>
  );
}

type Draft = {
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  ogImage: { id: string; url: string; alt: string } | null;
  noindex: boolean;
  nofollow: boolean;
  sitemapInclude: "" | "include" | "exclude";
  sitemapChangefreq: string;
  sitemapPriority: string;
  faqEnabled: boolean;
};

function draftFor(r: RouteRow): Draft {
  const o = r.override;
  return {
    metaTitle: o?.metaTitle ?? "",
    metaDescription: o?.metaDescription ?? "",
    canonical: o?.canonical ?? "",
    ogImage: o?.ogImage ? { id: o.ogImage.id, url: o.ogImage.url, alt: o.ogImage.alt } : null,
    noindex: !!o?.noindex,
    nofollow: !!o?.nofollow,
    sitemapInclude: o?.sitemapInclude === null || o?.sitemapInclude === undefined ? "" : o.sitemapInclude ? "include" : "exclude",
    sitemapChangefreq: o?.sitemapChangefreq ?? "",
    sitemapPriority: o?.sitemapPriority === null || o?.sitemapPriority === undefined ? "" : String(o.sitemapPriority),
    faqEnabled: o?.faqEnabled !== false,
  };
}

export function PagesManager({ rows, csrf, canWrite, siteUrl }: { rows: RouteRow[]; csrf: string; canWrite: boolean; siteUrl: string }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [only, setOnly] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [current, setCurrent] = useState<CurrentMeta | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => (!kind || r.kind === kind) && (!only || r.override) && (!term || r.path.toLowerCase().includes(term) || r.label.toLowerCase().includes(term)));
  }, [rows, q, kind, only]);

  function open(r: RouteRow) {
    setEditing(r);
    setDraft(draftFor(r));
    setCurrent(null);
    setIssues({});
  }

  async function loadCurrent() {
    if (!editing) return;
    setLoadingCurrent(true);
    const res = await apiPost<{ current: CurrentMeta }>("/api/admin/seo/overrides/current", { path: editing.path }, csrf);
    setLoadingCurrent(false);
    if (res.data.ok) setCurrent(res.data.current);
    else toast({ kind: "error", title: "Could not load the page", body: describeError(res.status, res.data.error) });
  }

  async function save() {
    if (!editing || !draft) return;
    const priority = draft.sitemapPriority.trim();
    if (priority && !/^(0(\.\d+)?|1(\.0+)?)$/.test(priority)) {
      setIssues({ sitemapPriority: "Enter a number between 0 and 1, for example 0.7" });
      return;
    }
    setPending(true);
    setIssues({});
    const body = {
      path: editing.path,
      metaTitle: draft.metaTitle.trim() || null,
      metaDescription: draft.metaDescription.trim() || null,
      canonical: draft.canonical.trim() || null,
      ogImageId: draft.ogImage?.id ?? null,
      noindex: draft.noindex || null,
      nofollow: draft.nofollow || null,
      sitemapInclude: draft.sitemapInclude === "" ? null : draft.sitemapInclude === "include",
      sitemapChangefreq: draft.sitemapChangefreq || null,
      sitemapPriority: priority ? Number(priority) : null,
      faqEnabled: editing.hasFaq && !draft.faqEnabled ? false : null,
    };
    const res = await apiPost<{ cleared: boolean }>("/api/admin/seo/overrides/save", body, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: res.data.cleared ? "Override cleared" : "Override saved", body: `${editing.path} serves it on the next request.` });
      setEditing(null);
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
    }
  }

  async function clear() {
    if (!editing) return;
    setPending(true);
    const res = await apiPost("/api/admin/seo/overrides/clear", { path: editing.path }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Override cleared", body: `${editing.path} is back to the values in its page file.` });
      setEditing(null);
      router.refresh();
    } else toast({ kind: "error", title: "Not cleared", body: describeError(res.status, res.data.error) });
  }

  // Every page but the home page goes through the "%s | DevelMo" title
  // template, so the preview and the counter include the suffix.
  const suffix = editing && editing.path !== "/" ? " | DevelMo" : "";
  const typedTitle = draft?.metaTitle.trim() ? `${draft.metaTitle.trim()}${suffix}` : "";
  const previewTitle = typedTitle || current?.title || (editing ? `${editing.label} | DevelMo` : "");
  const previewDescription = draft?.metaDescription.trim() || current?.description || "The description written in the page file. Load current values to see it here.";

  return (
    <>
      <div className="adm-toolbar" role="search">
        <div className="adm-field adm-field-q">
          <label className="adm-label" htmlFor="seo-q">Search routes</label>
          <input id="seo-q" className="adm-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="/what-we-do, CrowdIQ" />
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="seo-kind">Type</label>
          <select id="seo-kind" className="adm-input adm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All</option>
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <Checkbox id="seo-only" label="Only routes with an override" checked={only} onChange={(e) => setOnly(e.target.checked)} />
      </div>
      {visible.length === 0 ? (
        <div className="adm-card"><p className="adm-muted">No routes match.</p></div>
      ) : (
        <TableFrame>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="adm-sr">Public routes and their metadata overrides</caption>
              <thead>
                <tr>
                  <th scope="col">Route</th>
                  <th scope="col">Type</th>
                  <th scope="col">Overrides</th>
                  <th scope="col"><span className="adm-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const f = flags(r);
                  return (
                    <tr key={r.path}>
                      <td data-label="Route">
                        <div className="adm-seo-path">{r.path}</div>
                        <div className="adm-muted" style={{ fontSize: 13 }}>{r.label}</div>
                      </td>
                      <td data-label="Type">{KIND_LABELS[r.kind]}</td>
                      <td data-label="Overrides">
                        {f.length === 0 ? <span className="adm-muted">none</span> : (
                          <div className="adm-seo-flags">
                            {f.map((x) => <Badge key={x} tone={x === "noindex" || x === "nofollow" ? "warn" : "info"}>{x}</Badge>)}
                          </div>
                        )}
                      </td>
                      <td data-label="Actions" className="adm-td-actions">
                        <div className="adm-actions">
                          <a className="adm-btn adm-btn-ghost adm-btn-sm" href={`${siteUrl}${r.path === "/" ? "" : r.path}`} target="_blank" rel="noreferrer">View</a>
                          <Button size="sm" variant={r.override ? "primary" : "ghost"} onClick={() => open(r)}>{canWrite ? "Edit" : "Inspect"}</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableFrame>
      )}
      <div className="adm-table-foot"><span>{visible.length} of {rows.length} routes</span></div>

      {editing && draft && (
        <Modal
          id="seo-override"
          open
          onClose={() => (pending ? null : setEditing(null))}
          title={`Metadata for ${editing.path}`}
          wide
          footer={
            <div className="adm-actions">
              {canWrite && editing.override && <Button variant="danger" size="sm" onClick={clear} disabled={pending}>Clear override</Button>}
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>Close</Button>
              {canWrite && <Button size="sm" onClick={save} disabled={pending}>{pending ? "Saving" : "Save"}</Button>}
            </div>
          }
        >
          <div className="adm-split">
            <div className="adm-form">
              <div className="adm-field">
                <Input id="ov-title" label="Meta title" value={draft.metaTitle} onChange={(e) => setDraft({ ...draft, metaTitle: e.target.value })} maxLength={150} disabled={!canWrite || pending} error={issues.metaTitle} placeholder={current?.title ?? "Blank keeps the page's own title"} help={suffix ? "The site name is added when served: your title | DevelMo" : "The home page title is served exactly as typed"} />
                <Counter value={typedTitle} limit={TITLE_LIMIT} />
              </div>
              <div className="adm-field">
                <Textarea id="ov-desc" label="Meta description" rows={3} value={draft.metaDescription} onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })} maxLength={400} disabled={!canWrite || pending} error={issues.metaDescription} placeholder={current?.description ?? "Blank keeps the page's own description"} />
                <Counter value={draft.metaDescription} limit={DESCRIPTION_LIMIT} />
              </div>
              <Input id="ov-canonical" label="Canonical" value={draft.canonical} onChange={(e) => setDraft({ ...draft, canonical: e.target.value })} maxLength={2000} disabled={!canWrite || pending} error={issues.canonical} help={`Blank keeps ${current?.canonical ?? `${siteUrl}${editing.path === "/" ? "" : editing.path}`}. A path or an absolute URL.`} />
              <div className="adm-field">
                <span className="adm-label">Open Graph image</span>
                {draft.ogImage ? (
                  <div className="adm-media-row">
                    <img src={draft.ogImage.url} alt={draft.ogImage.alt} className="adm-media-thumb" width={96} height={54} style={{ objectFit: "cover", borderRadius: 8 }} />
                    <div className="adm-actions">
                      {canWrite && <Button size="sm" variant="ghost" onClick={() => setPicker(true)} disabled={pending}>Change</Button>}
                      {canWrite && <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, ogImage: null })} disabled={pending}>Use the default</Button>}
                    </div>
                  </div>
                ) : (
                  <div className="adm-actions">
                    <span className="adm-muted">Default artwork (og.jpg)</span>
                    {canWrite && <Button size="sm" variant="ghost" onClick={() => setPicker(true)} disabled={pending}>Choose from media</Button>}
                  </div>
                )}
              </div>
              <div className="adm-form-row">
                <Checkbox id="ov-noindex" label="noindex (keep out of search results)" checked={draft.noindex} onChange={(e) => setDraft({ ...draft, noindex: e.target.checked })} disabled={!canWrite || pending} />
                <Checkbox id="ov-nofollow" label="nofollow (do not follow links on it)" checked={draft.nofollow} onChange={(e) => setDraft({ ...draft, nofollow: e.target.checked })} disabled={!canWrite || pending} />
              </div>
              <div className="adm-form-row">
                <div className="adm-field">
                  <label className="adm-label" htmlFor="ov-sitemap">Sitemap</label>
                  <select id="ov-sitemap" className="adm-input adm-select" value={draft.sitemapInclude} onChange={(e) => setDraft({ ...draft, sitemapInclude: e.target.value as Draft["sitemapInclude"] })} disabled={!canWrite || pending}>
                    <option value="">Default ({editing.sitemapDefault.include ? "included" : "excluded"})</option>
                    <option value="include">Included</option>
                    <option value="exclude">Excluded</option>
                  </select>
                </div>
                <div className="adm-field">
                  <label className="adm-label" htmlFor="ov-freq">Change frequency</label>
                  <select id="ov-freq" className="adm-input adm-select" value={draft.sitemapChangefreq} onChange={(e) => setDraft({ ...draft, sitemapChangefreq: e.target.value })} disabled={!canWrite || pending}>
                    <option value="">Default ({editing.sitemapDefault.changefreq})</option>
                    {CHANGEFREQS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <Input id="ov-priority" label="Priority" inputMode="decimal" value={draft.sitemapPriority} onChange={(e) => setDraft({ ...draft, sitemapPriority: e.target.value })} disabled={!canWrite || pending} error={issues.sitemapPriority} help={`Blank keeps ${editing.sitemapDefault.priority}`} />
              </div>
              {editing.hasFaq && (
                <Checkbox id="ov-faq" label="Emit FAQPage structured data for this page" checked={draft.faqEnabled} onChange={(e) => setDraft({ ...draft, faqEnabled: e.target.checked })} disabled={!canWrite || pending} />
              )}
            </div>
            <div className="adm-stack">
              <SerpPreview siteUrl={siteUrl} path={editing.path} title={previewTitle} description={previewDescription} />
              <div className="adm-actions">
                <Button size="sm" variant="ghost" onClick={loadCurrent} disabled={loadingCurrent}>{loadingCurrent ? "Loading" : "Load current values"}</Button>
              </div>
              {current && (
                <dl className="adm-dl">
                  <dt>Status</dt><dd>{current.status === 200 ? "200, served" : `${current.status}, not a page that serves metadata`}</dd>
                  <dt>Served title</dt><dd>{current.title ?? <span className="adm-muted">none</span>}</dd>
                  <dt>Served description</dt><dd>{current.description ?? <span className="adm-muted">none</span>}</dd>
                  <dt>Canonical</dt><dd>{current.canonical ?? <span className="adm-muted">none</span>}</dd>
                  <dt>Robots</dt><dd>{current.robots ?? <span className="adm-muted">not set (indexable)</span>}</dd>
                  <dt>H1</dt><dd>{current.h1s.length === 0 ? <span className="adm-muted">none</span> : current.h1s.join(" | ")}</dd>
                </dl>
              )}
              {!editing.override && <Alert kind="info" live={false}>No override yet. Blank fields keep what the page file says.</Alert>}
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <MediaPicker open={picker} onClose={() => setPicker(false)} csrf={csrf} canWrite={canWrite} title="Choose the Open Graph image" onPick={(m: MediaView) => {
          setDraft((d) => (d ? { ...d, ogImage: { id: m.id, url: m.url, alt: m.altText } } : d));
          setPicker(false);
        }} />
      )}
    </>
  );
}
