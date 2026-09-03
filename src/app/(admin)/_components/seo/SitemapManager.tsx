"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SitemapState } from "@/lib/admin/settings";
import type { SitemapRow } from "@/lib/seo/sitemap";
import { CHANGEFREQS } from "@/lib/schemas/seo";
import { apiPost, describeError } from "../api-client";
import { Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

const REASONS: Record<SitemapRow["reason"], string> = { default: "", override: "override", noindex: "noindex", content: "editor noindex" };

export function SitemapManager({ rows, state, csrf, canWrite, sitemapUrl }: { rows: SitemapRow[]; state: SitemapState; csrf: string; canWrite: boolean; sitemapUrl: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [q, setQ] = useState("");

  // Only the sitemap fields of the override are sent; the save merges by
  // path on the server, so the row's other fields are untouched.
  async function patch(row: SitemapRow, changes: { include?: "" | "include" | "exclude"; changefreq?: string; priority?: string }) {
    setBusy(row.path);
    const include = changes.include !== undefined ? changes.include : row.explicit.include === null ? "" : row.explicit.include ? "include" : "exclude";
    const changefreq = changes.changefreq !== undefined ? changes.changefreq : row.explicit.changefreq ?? "";
    const priorityRaw = changes.priority !== undefined ? changes.priority : row.explicit.priority === null ? "" : String(row.explicit.priority);
    const priority = priorityRaw.trim();
    if (priority && !/^(0(\.\d+)?|1(\.0+)?)$/.test(priority)) {
      setBusy(null);
      toast({ kind: "error", title: "Priority must be between 0 and 1" });
      return;
    }
    const save = await apiPost("/api/admin/seo/overrides/sitemap", { path: row.path, sitemapInclude: include === "" ? null : include === "include", sitemapChangefreq: changefreq || null, sitemapPriority: priority ? Number(priority) : null }, csrf);
    setBusy(null);
    if (save.data.ok) {
      toast({ kind: "success", title: "Sitemap updated", body: "Regenerate now to publish it, or wait for the next crawler visit." });
      router.refresh();
    } else toast({ kind: "error", title: "Not saved", body: describeError(save.status, save.data.error) });
  }

  async function regenerate() {
    setRegen(true);
    const res = await apiPost("/api/admin/seo/sitemap/regenerate", {}, csrf);
    if (res.data.ok) {
      toast({ kind: "success", title: "Sitemap regenerated", body: "Rebuilt now; the generation time updates in a moment." });
      // The file is rebuilt right after the response; give it a moment
      // before reading the new generation time.
      setTimeout(() => {
        setRegen(false);
        router.refresh();
      }, 2500);
    } else {
      setRegen(false);
      toast({ kind: "error", title: "Not regenerated", body: describeError(res.status, res.data.error) });
    }
  }

  const term = q.trim().toLowerCase();
  const visible = term ? rows.filter((r) => r.path.toLowerCase().includes(term) || r.label.toLowerCase().includes(term)) : rows;

  return (
    <>
      <Card
        title="Generated file"
        description={`Last generated ${fmt(state.generatedAt)}${state.generatedAt ? `, ${state.urls} URLs` : ""}. The file is cached and rebuilt on the next request after a change here; Regenerate now rebuilds it immediately.`}
        actions={
          <>
            <a className="adm-btn adm-btn-ghost adm-btn-sm" href={sitemapUrl} target="_blank" rel="noreferrer">Open sitemap.xml</a>
            {canWrite && <Button size="sm" onClick={regenerate} disabled={regen}>{regen ? "Regenerating" : "Regenerate now"}</Button>}
          </>
        }
      />
      <div className="adm-toolbar" role="search" style={{ marginBlockStart: 18 }}>
        <div className="adm-field adm-field-q">
          <label className="adm-label" htmlFor="sm-q">Search routes</label>
          <input id="sm-q" className="adm-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <TableFrame>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <caption className="adm-sr">Sitemap entries per public route</caption>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">In sitemap</th>
                <th scope="col">Change frequency</th>
                <th scope="col">Priority</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.path}>
                  <td data-label="Route">
                    <div className="adm-seo-path">{r.path}</div>
                    <div className="adm-muted" style={{ fontSize: 13 }}>{r.label}</div>
                  </td>
                  <td data-label="In sitemap">
                    {r.reason === "content" || r.reason === "noindex" ? (
                      <Badge tone="muted">excluded, {REASONS[r.reason]}</Badge>
                    ) : canWrite ? (
                      <select key={`${r.path}-${String(r.explicit.include)}`} className="adm-input adm-select" aria-label={`Sitemap inclusion for ${r.path}`} defaultValue={r.explicit.include === null ? "" : r.explicit.include ? "include" : "exclude"} onChange={(e) => patch(r, { include: e.target.value as "" | "include" | "exclude" })} disabled={busy === r.path}>
                        <option value="">Default ({r.defaults.include ? "included" : "excluded"})</option>
                        <option value="include">Included</option>
                        <option value="exclude">Excluded</option>
                      </select>
                    ) : (
                      <Badge tone={r.included ? "ok" : "muted"}>{r.included ? "included" : "excluded"}</Badge>
                    )}
                  </td>
                  <td data-label="Change frequency">
                    {canWrite ? (
                      <select key={`${r.path}-${r.explicit.changefreq ?? ""}`} className="adm-input adm-select" aria-label={`Change frequency for ${r.path}`} defaultValue={r.explicit.changefreq ?? ""} onChange={(e) => patch(r, { changefreq: e.target.value })} disabled={busy === r.path}>
                        <option value="">Default ({r.defaults.changefreq})</option>
                        {CHANGEFREQS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : r.changefreq}
                  </td>
                  <td data-label="Priority">
                    {canWrite ? (
                      <PriorityField key={`${r.path}-${String(r.explicit.priority)}`} row={r} disabled={busy === r.path} onCommit={(v) => patch(r, { priority: v })} />
                    ) : r.priority}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableFrame>
      <div className="adm-table-foot"><span>{visible.length} of {rows.length} routes</span></div>
    </>
  );
}

function PriorityField({ row, disabled, onCommit }: { row: SitemapRow; disabled: boolean; onCommit: (v: string) => void }) {
  const initial = row.explicit.priority === null ? "" : String(row.explicit.priority);
  const [value, setValue] = useState(initial);
  return (
    <input
      className="adm-input"
      aria-label={`Priority for ${row.path}`}
      inputMode="decimal"
      placeholder={`Default ${row.defaults.priority}`}
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() !== initial) onCommit(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      style={{ maxInlineSize: 120 }}
    />
  );
}
