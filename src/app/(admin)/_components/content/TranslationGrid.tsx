"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CellValue, GridParams, GridRow } from "@/lib/admin/translations";
import { EDITABLE_LOCALES } from "@/lib/i18n/keys";
import { localeLabels, isRtl } from "@/lib/i18n";
import { apiPost, describeError } from "../api-client";
import { Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const VIEWS: { id: GridParams["view"]; label: string }[] = [
  { id: "all", label: "All keys" },
  { id: "missing", label: "Missing" },
  { id: "overridden", label: "Edited here" },
];

const TONE: Record<CellValue["source"], "ok" | "info" | "warn"> = { file: "ok", database: "info", missing: "warn" };

function href(params: GridParams, patch: Partial<GridParams>): string {
  const next = { ...params, ...patch };
  const q = new URLSearchParams();
  if (next.q) q.set("q", next.q);
  if (next.locale) q.set("locale", next.locale);
  if (next.view !== "all") q.set("view", next.view);
  if (next.page > 1) q.set("page", String(next.page));
  const s = q.toString();
  return `/admin/translations${s ? `?${s}` : ""}`;
}

export function TranslationGrid({ params, rows, total, csrf, canWrite }: { params: GridParams; rows: GridRow[]; total: number; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ key: string; locale: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const shown = params.locale ? [params.locale] : (EDITABLE_LOCALES as readonly string[]);
  const pages = Math.max(1, Math.ceil(total / params.pageSize));

  function open(key: string, locale: string, value: string) {
    setEditing({ key, locale });
    setDraft(value);
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    const res = await apiPost<{ cleared: boolean }>("/api/admin/translations/save", { locale: editing.locale, key: editing.key, value: draft }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: res.data.cleared ? "Override cleared" : "Translation saved", body: res.data.cleared ? "The file value applies again." : "The public site uses it on the next request." });
      setEditing(null);
      router.refresh();
      return;
    }
    toast({ kind: "error", title: "Not saved", body: res.data.error === "decorative" ? "That label is English by design and is not translated." : describeError(res.status, res.data.error) });
  }

  return (
    <>
      <form className="adm-toolbar" method="get" action="/admin/translations" role="search">
        <div className="adm-field adm-field-q">
          <label className="adm-label" htmlFor="tr-q">Search keys and translations</label>
          <input id="tr-q" className="adm-input" type="search" name="q" defaultValue={params.q} />
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="tr-locale">Locale</label>
          <select id="tr-locale" className="adm-input adm-select" name="locale" defaultValue={params.locale}>
            <option value="">All locales</option>
            {EDITABLE_LOCALES.map((l) => <option key={l} value={l}>{localeLabels[l]}</option>)}
          </select>
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="tr-view">View</label>
          <select id="tr-view" className="adm-input adm-select" name="view" defaultValue={params.view}>
            {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div className="adm-actions">
          <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm">Apply</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <Card title="No keys match" description={params.view === "missing" ? "Nothing is missing for this filter, which is the result you want." : "Try a different search."} />
      ) : (
        <TableFrame>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="adm-sr">Translation keys by locale</caption>
              <thead>
                <tr>
                  <th scope="col">English source</th>
                  {shown.map((l) => <th key={l} scope="col">{localeLabels[l as keyof typeof localeLabels]}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td data-label="English source">
                      <div style={{ overflowWrap: "anywhere" }}>{row.key}</div>
                      <Badge tone="muted">{row.source === "ui" ? "generated" : "supplementary"}</Badge>
                    </td>
                    {shown.map((l) => {
                      const cell = row.cells[l];
                      const isEditing = editing?.key === row.key && editing?.locale === l;
                      return (
                        <td key={l} data-label={localeLabels[l as keyof typeof localeLabels]}>
                          {isEditing ? (
                            <div className="adm-form">
                              <label className="adm-sr" htmlFor="tr-edit">Translation for {row.key}</label>
                              <textarea
                                id="tr-edit"
                                className="adm-input"
                                rows={3}
                                dir={isRtl(l) ? "rtl" : "ltr"}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                disabled={pending}
                                autoFocus
                              />
                              <div className="adm-actions">
                                <Button size="sm" onClick={save} disabled={pending}>{pending ? "Saving" : "Save"}</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
                              </div>
                              <p className="adm-help">Empty clears the override and restores the file value.</p>
                            </div>
                          ) : (
                            <div>
                              <div dir={isRtl(l) ? "rtl" : "ltr"} style={{ overflowWrap: "anywhere" }}>
                                {cell.value || <span className="adm-muted">not translated</span>}
                              </div>
                              <div className="adm-seo-flags" style={{ marginBlockStart: 4 }}>
                                <Badge tone={TONE[cell.source]}>{cell.source === "database" ? "edited here" : cell.source === "file" ? "from file" : "missing"}</Badge>
                                {canWrite && <Button size="sm" variant="ghost" onClick={() => open(row.key, l, cell.value)}>Edit</Button>}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFrame>
      )}

      <div className="adm-table-foot">
        <span>{total === 0 ? "No keys" : `Showing ${(params.page - 1) * params.pageSize + 1} to ${Math.min(total, params.page * params.pageSize)} of ${total}`}</span>
        {pages > 1 && (
          <nav aria-label="Pagination">
            <ul className="adm-pages">
              {params.page > 1 && <li><Link href={href(params, { page: params.page - 1 })}>Previous</Link></li>}
              <li><span aria-current="page">{params.page}</span></li>
              {params.page < pages && <li><Link href={href(params, { page: params.page + 1 })}>Next</Link></li>}
            </ul>
          </nav>
        )}
      </div>
    </>
  );
}
