"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RedirectRow } from "@/lib/admin/seo";
import type { RuleCheck } from "@/lib/seo/redirect-rules";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { ConfirmDialog } from "../ui/Modal";
import { TableFrame } from "../ui/TableFrame";
import { Toggle } from "../ui/Toggle";
import { useToast } from "../ui/Toast";

type Draft = { id?: string; source: string; destination: string; code: 301 | 302; enabled: boolean; note: string };
const EMPTY: Draft = { source: "", destination: "", code: 301, enabled: true, note: "" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

export function RedirectsManager({ rows, csrf, canWrite }: { rows: RedirectRow[]; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [check, setCheck] = useState<RuleCheck | null>(null);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<RedirectRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Loop and conflict detection as the rule is typed, debounced.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const seq = ++checkSeq.current;
    timer.current = setTimeout(async () => {
      if (!draft.source.trim() || !draft.destination.trim()) {
        setCheck(null);
        return;
      }
      const res = await apiPost<{ check: RuleCheck }>("/api/admin/seo/redirects/check", { ...draft, id: draft.id }, csrf);
      // Only the latest request may update the panel.
      if (seq !== checkSeq.current) return;
      if (res.data.ok) setCheck(res.data.check);
      else if (res.status === 400) setCheck(null);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, csrf]);

  function edit(r: RedirectRow) {
    setDraft({ id: r.id, source: r.source, destination: r.destination, code: r.code === 302 ? 302 : 301, enabled: r.enabled, note: r.note });
    setIssues({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setIssues({});
    const res = await apiPost<{ id: string; check: RuleCheck }>("/api/admin/seo/redirects/save", { ...draft }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: draft.id ? "Redirect updated" : "Redirect created", body: "Live on every instance within the refresh window." });
      setDraft(EMPTY);
      setCheck(null);
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[]; check?: RuleCheck };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      if (raw.check) setCheck(raw.check);
      toast({ kind: "error", title: "Not saved", body: res.data.error === "invalid_rule" ? "Fix the problems listed under the form." : describeError(res.status, res.data.error) });
    }
  }

  async function toggle(r: RedirectRow, enabled: boolean) {
    setBusy(r.id);
    const res = await apiPost("/api/admin/seo/redirects/toggle", { id: r.id, enabled }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: enabled ? "Redirect enabled" : "Redirect disabled" });
      // The same rule may be open in the form; keep it in step.
      if (draft.id === r.id) setDraft((d) => ({ ...d, enabled }));
      router.refresh();
    } else toast({ kind: "error", title: "Not changed", body: describeError(res.status, res.data.error) });
  }

  async function remove() {
    if (!confirm) return;
    setBusy(confirm.id);
    const res = await apiPost("/api/admin/seo/redirects/delete", { id: confirm.id }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: "Redirect deleted" });
      if (draft.id === confirm.id) setDraft(EMPTY);
      setConfirm(null);
      router.refresh();
    } else toast({ kind: "error", title: "Not deleted", body: describeError(res.status, res.data.error) });
  }

  return (
    <>
      {canWrite && (
        <form ref={formRef} className="adm-card adm-form" onSubmit={save} noValidate aria-labelledby="redirect-form-title" style={{ marginBlockEnd: 18 }}>
          <h2 id="redirect-form-title" className="adm-card-head" style={{ margin: 0 }}>{draft.id ? "Edit redirect" : "New redirect"}</h2>
          <div className="adm-form-row">
            <Input id="rd-source" label="Source path" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="/old-page" error={issues.source} disabled={pending} help="The path visitors request. Query strings are carried over." />
            <Input id="rd-dest" label="Destination" value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} placeholder="/what-we-do or https://..." error={issues.destination} disabled={pending} />
          </div>
          <div className="adm-form-row">
            <div className="adm-field">
              <label className="adm-label" htmlFor="rd-code">Type</label>
              <select id="rd-code" className="adm-input adm-select" value={draft.code} onChange={(e) => setDraft({ ...draft, code: Number(e.target.value) === 302 ? 302 : 301 })} disabled={pending}>
                <option value={301}>301 permanent</option>
                <option value={302}>302 temporary</option>
              </select>
            </div>
            <Input id="rd-note" label="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={300} error={issues.note} disabled={pending} help="Why this rule exists, for the next person." />
            <div className="adm-field">
              <span className="adm-label">State</span>
              <Toggle id="rd-enabled" checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label={draft.enabled ? "Enabled" : "Disabled"} disabled={pending} />
            </div>
          </div>
          {check && check.errors.length > 0 && (
            <Alert kind="error">
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Alert>
          )}
          {check && check.errors.length === 0 && check.warnings.length > 0 && (
            <Alert kind="warn">
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>{check.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </Alert>
          )}
          {check && check.errors.length === 0 && check.warnings.length === 0 && <Alert kind="success" live={false}>No loop, no conflict: {check.chain.join(" to ")}</Alert>}
          <div className="adm-actions">
            {draft.id && <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(EMPTY); setCheck(null); setIssues({}); }} disabled={pending}>Cancel edit</Button>}
            <Button type="submit" size="sm" disabled={pending || !draft.source.trim() || !draft.destination.trim() || (check?.errors.length ?? 0) > 0}>{pending ? "Saving" : draft.id ? "Save changes" : "Create redirect"}</Button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="adm-card" style={{ marginBlockEnd: 18 }}><p className="adm-muted" style={{ margin: 0 }}>No database redirects yet. Renaming the slug of a post creates one automatically; add others above.</p></div>
      ) : (
        <div style={{ marginBlockEnd: 18 }}>
          <TableFrame>
            <div className="adm-table-wrap" tabIndex={0}>
              <table className="adm-table">
                <caption className="adm-sr">Database redirects</caption>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Code</th>
                    <th scope="col">State</th>
                    <th scope="col">Hits</th>
                    <th scope="col">Last hit</th>
                    <th scope="col"><span className="adm-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Source">
                        <div className="adm-seo-path">{r.source}</div>
                        {r.note && <div className="adm-muted" style={{ fontSize: 13 }}>{r.note}</div>}
                      </td>
                      <td data-label="Destination" className="adm-seo-path">{r.destination}</td>
                      <td data-label="Code">{r.code}</td>
                      <td data-label="State">
                        {canWrite ? (
                          <Toggle id={`rd-on-${r.id}`} checked={r.enabled} onChange={(v) => toggle(r, v)} label={r.enabled ? "On" : "Off"} disabled={busy === r.id} />
                        ) : (
                          <Badge tone={r.enabled ? "ok" : "muted"}>{r.enabled ? "Enabled" : "Disabled"}</Badge>
                        )}
                      </td>
                      <td data-label="Hits">{r.hits}</td>
                      <td data-label="Last hit">{fmt(r.lastHitAt)}</td>
                      <td data-label="Actions" className="adm-td-actions">
                        {canWrite && (
                          <div className="adm-actions">
                            <Button size="sm" variant="ghost" onClick={() => edit(r)} disabled={busy === r.id}>Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => setConfirm(r)} disabled={busy === r.id}>Delete</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>
        </div>
      )}
      <ConfirmDialog id="rd-delete" open={!!confirm} title="Delete this redirect?" body={confirm ? `${confirm.source} will stop redirecting within the refresh window. Its ${confirm.hits} recorded hits are lost with it.` : ""} confirmLabel="Delete" pending={busy === confirm?.id} onConfirm={remove} onCancel={() => setConfirm(null)} />
    </>
  );
}
