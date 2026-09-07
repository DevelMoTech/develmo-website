"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CacheTagRow } from "@/lib/admin/performance";
import { apiPost, describeError } from "../api-client";
import { Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "not since this log began");

export function CachePanel({ tags, routes, csrf, canWrite }: { tags: CacheTagRow[]; routes: string[]; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [path, setPath] = useState(routes[0] ?? "/");
  const [type, setType] = useState<"page" | "layout">("page");
  const [pending, setPending] = useState(false);

  async function bustTag(tag: string) {
    setBusy(tag);
    const res = await apiPost("/api/admin/performance/revalidate-tag", { tag }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: `Revalidated ${tag}`, body: "Anything cached behind that tag is rebuilt on its next request." });
      router.refresh();
    } else toast({ kind: "error", title: "Not revalidated", body: describeError(res.status, res.data.error) });
  }

  async function bustPath(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await apiPost("/api/admin/performance/revalidate-path", { path, type }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: `Revalidated ${path}`, body: type === "layout" ? "That path and everything beneath it are rebuilt on their next request." : "That page is rebuilt on its next request." });
      router.refresh();
    } else toast({ kind: "error", title: "Not revalidated", body: describeError(res.status, res.data.error) });
  }

  return (
    <>
      {canWrite && (
        <Card title="Revalidate a path" description="Marks one URL, or a whole branch, for a rebuild on its next request.">
          <form className="adm-form adm-inline-form" onSubmit={bustPath} noValidate>
            <div className="adm-field">
              <label className="adm-label" htmlFor="rv-path">Path</label>
              <select id="rv-path" className="adm-input adm-select" value={path} onChange={(e) => setPath(e.target.value)} disabled={pending}>
                {routes.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="rv-type">Scope</label>
              <select id="rv-type" className="adm-input adm-select" value={type} onChange={(e) => setType(e.target.value === "layout" ? "layout" : "page")} disabled={pending}>
                <option value="page">This page only</option>
                <option value="layout">This path and everything beneath it</option>
              </select>
            </div>
            <div className="adm-actions">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Revalidating" : "Revalidate path"}</Button>
            </div>
          </form>
        </Card>
      )}

      <div style={{ marginBlockStart: 18 }}>
        <TableFrame>
          <div className="adm-table-wrap" tabIndex={0}>
            <table className="adm-table">
              <caption className="adm-sr">Cache tags and when each was last invalidated</caption>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">What it holds</th>
                  <th scope="col">Last invalidated</th>
                  <th scope="col"><span className="adm-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.tag}>
                    <td data-label="Tag"><span className="adm-mono">{t.tag}</span></td>
                    <td data-label="What it holds">{t.description}</td>
                    <td data-label="Last invalidated">
                      {fmt(t.lastRevalidatedAt)}
                      {t.lastAction && <div className="adm-muted" style={{ fontSize: 13 }}>{t.lastAction}{t.lastActor ? ` by ${t.lastActor}` : ""}</div>}
                    </td>
                    <td data-label="Actions" className="adm-td-actions">
                      {canWrite && <Button size="sm" variant="ghost" disabled={busy === t.tag} onClick={() => bustTag(t.tag)}>{busy === t.tag ? "Working" : "Revalidate"}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFrame>
      </div>
      <p className="adm-help">
        Publishing a post, saving a job, changing metadata or editing an access rule already invalidates the right tag. These buttons exist for the
        case where something is stale anyway. The last invalidated column reads the audit trail, so it reports what actually happened rather than
        when this page was last opened.
      </p>
    </>
  );
}
