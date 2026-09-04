"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccessRuleRow } from "@/lib/admin/security";
import { cidrSize, parseCidr } from "@/lib/security/cidr";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { ConfirmDialog } from "../ui/Modal";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

type Draft = { id?: string; cidr: string; action: "block" | "allow"; reason: string; expiresAt: string; confirm: string };
const EMPTY: Draft = { cidr: "", action: "block", reason: "", expiresAt: "", confirm: "" };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "never");
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

// Same containment test the server runs, so the confirmation field appears
// as the range is typed rather than only after a refusal.
function coversYou(cidrText: string, ip: string): boolean {
  const cidr = parseCidr(cidrText);
  const address = parseCidr(ip);
  if (!cidr || !address) return false;
  const fullBytes = cidr.prefix >> 3;
  for (let i = 0; i < fullBytes; i++) if (address.bytes[i] !== cidr.bytes[i]) return false;
  const bits = cidr.prefix & 7;
  if (bits === 0) return true;
  const mask = (0xff << (8 - bits)) & 0xff;
  return (address.bytes[fullBytes] & mask) === (cidr.bytes[fullBytes] & mask);
}

export function AccessManager({ rules, csrf, yourIp }: { rules: AccessRuleRow[]; csrf: string; yourIp: string }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<AccessRuleRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const parsed = useMemo(() => (draft.cidr.trim() ? parseCidr(draft.cidr.trim()) : null), [draft.cidr]);
  const wouldLockYouOut = draft.action === "block" && !!parsed && coversYou(parsed.text, yourIp);
  const broad = !!parsed && parsed.prefix < 120 && draft.action === "block";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setIssues({});
    const res = await apiPost<{ id: string; detail?: string }>("/api/admin/security/access/save", { ...draft }, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: draft.id ? "Rule updated" : `Rule added: ${draft.action === "block" ? "blocking" : "allowing"} ${parsed?.text ?? draft.cidr}`, body: "In force on every instance within five seconds." });
      setDraft(EMPTY);
      router.refresh();
      return;
    }
    const raw = res.data as { error?: string; detail?: string; issues?: { path: string; message: string }[] };
    if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
    if (raw.error === "self_lockout") {
      setIssues((prev) => ({ ...prev, confirm: raw.detail ?? "Type your own address to confirm" }));
      toast({ kind: "error", title: "Refused: this would lock you out", body: raw.detail ?? "" });
      return;
    }
    if (raw.error === "duplicate") {
      setIssues((prev) => ({ ...prev, cidr: "A rule for this range already exists" }));
      toast({ kind: "error", title: "Not saved", body: "A rule for that range already exists. Edit it instead." });
      return;
    }
    toast({ kind: "error", title: "Not saved", body: describeError(res.status, raw.error) });
  }

  async function remove() {
    if (!confirmDelete) return;
    setBusy(confirmDelete.id);
    const res = await apiPost("/api/admin/security/access/delete", { id: confirmDelete.id }, csrf);
    setBusy(null);
    if (res.data.ok) {
      toast({ kind: "success", title: "Rule removed", body: `${confirmDelete.cidr} is no longer ${confirmDelete.action === "block" ? "blocked" : "allowed"}.` });
      setConfirmDelete(null);
      router.refresh();
    } else toast({ kind: "error", title: "Not removed", body: describeError(res.status, res.data.error) });
  }

  const blocks = rules.filter((r) => r.action === "block");
  const allows = rules.filter((r) => r.action === "allow");

  return (
    <>
      <form className="adm-card adm-form" onSubmit={save} noValidate aria-labelledby="access-form-title" style={{ marginBlockEnd: 18 }}>
        <h2 id="access-form-title" className="adm-card-head" style={{ margin: 0 }}>{draft.id ? "Edit rule" : "New rule"}</h2>
        <div className="adm-form-row">
          <Input id="ac-cidr" label="Address or range" value={draft.cidr} onChange={(e) => setDraft({ ...draft, cidr: e.target.value })} placeholder="203.0.113.9 or 203.0.113.0/24" error={issues.cidr} disabled={pending} help={parsed ? `Stored as ${parsed.text}${parsed.prefix < 128 ? `, covering ${cidrSize(parsed).toLocaleString("en-GB")} addresses` : ", a single address"}` : "A single address, or CIDR notation for a range. IPv4 and IPv6."} />
          <div className="adm-field">
            <label className="adm-label" htmlFor="ac-action">Action</label>
            <select id="ac-action" className="adm-input adm-select" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value === "allow" ? "allow" : "block" })} disabled={pending}>
              <option value="block">Block, 403 on the whole site</option>
              <option value="allow">Allow, overrides any block</option>
            </select>
          </div>
        </div>
        <div className="adm-form-row">
          <Input id="ac-reason" label="Reason" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} maxLength={300} error={issues.reason} disabled={pending} help="Why this rule exists, for the next person." />
          <Input id="ac-expires" label="Expires" type="date" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} error={issues.expiresAt} disabled={pending} help="Blank means it never expires. The cron removes expired rules." />
        </div>
        {broad && !wouldLockYouOut && (
          <Alert kind="warn" live={false}>{`${parsed?.text} is a wide range. Everyone behind it, including anyone sharing that network, is refused.`}</Alert>
        )}
        {wouldLockYouOut && (
          <>
            <Alert kind="error">This range covers the address you are connecting from ({yourIp}). Saving it would give you a 403 on this console and on the public site.</Alert>
            <Input id="ac-confirm" label={`Type ${yourIp} to block yourself anyway`} value={draft.confirm} onChange={(e) => setDraft({ ...draft, confirm: e.target.value })} error={issues.confirm} disabled={pending} autoComplete="off" />
          </>
        )}
        <div className="adm-actions">
          {draft.id && <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(EMPTY); setIssues({}); }} disabled={pending}>Cancel edit</Button>}
          <Button type="submit" size="sm" variant={wouldLockYouOut ? "danger" : "primary"} disabled={pending || !parsed || (wouldLockYouOut && draft.confirm.trim() !== yourIp)}>
            {pending ? "Saving" : draft.id ? "Save changes" : draft.action === "block" ? "Block this address" : "Allow this address"}
          </Button>
        </div>
        <p className="adm-help">You are connecting from {yourIp}. Only the salted hash of an address is ever stored in the event log.</p>
      </form>

      {rules.length === 0 ? (
        <Card title="No rules" description="Nothing is blocked or allowed by address. Add a rule above when you need to shut out a specific source." />
      ) : (
        <TableFrame>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="adm-sr">IP access rules</caption>
              <thead>
                <tr>
                  <th scope="col">Range</th>
                  <th scope="col">Action</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Added</th>
                  <th scope="col"><span className="adm-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {[...allows, ...blocks].map((r) => (
                  <tr key={r.id}>
                    <td data-label="Range">
                      <span className="adm-mono">{r.cidr}</span>
                      {coversYou(r.cidr, yourIp) && <div className="adm-muted" style={{ fontSize: 13 }}>covers your address</div>}
                    </td>
                    <td data-label="Action"><Badge tone={r.action === "block" ? "danger" : "ok"}>{r.action}</Badge></td>
                    <td data-label="Reason">{r.reason || <span className="adm-muted">none given</span>}</td>
                    <td data-label="Expires">{r.expired ? <Badge tone="muted">expired</Badge> : fmtDate(r.expiresAt)}</td>
                    <td data-label="Added"><span className="adm-muted">{fmt(r.createdAt)}{r.createdByEmail ? ` by ${r.createdByEmail}` : ""}</span></td>
                    <td data-label="Actions" className="adm-td-actions">
                      <div className="adm-actions">
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => { setDraft({ id: r.id, cidr: r.cidr, action: r.action, reason: r.reason, expiresAt: r.expiresAt ? r.expiresAt.slice(0, 10) : "", confirm: "" }); setIssues({}); }}>Edit</Button>
                        <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => setConfirmDelete(r)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFrame>
      )}
      <ConfirmDialog
        id="ac-delete"
        open={!!confirmDelete}
        title="Remove this rule?"
        body={confirmDelete ? `${confirmDelete.cidr} will stop being ${confirmDelete.action === "block" ? "blocked" : "allowed"} within five seconds.` : ""}
        confirmLabel="Remove"
        pending={busy === confirmDelete?.id}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
