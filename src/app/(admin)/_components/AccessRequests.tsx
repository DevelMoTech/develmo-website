"use client";

import { useState } from "react";
import type { Role } from "@/lib/auth/rbac";
import type { NoticeOutcome } from "@/lib/notify";
import { useSubmit } from "./api-client";
import { Alert, Badge } from "./ui/Basics";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

export type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  organisation: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  notifiedAt: string | null;
  notifyChannel: string | null;
  notifyError: string | null;
  createdAt: string;
};

const TONE = { pending: "warn", approved: "ok", declined: "muted" } as const;

// The queue behind the public request form. Approving mints the same
// single-use invite the form above mints, so nothing here is a shortcut into
// the console. Each row also says whether the admin was actually told about
// it, because a request nobody hears about is a request nobody decides.
export function AccessRequests({ csrf, requests, invitable, canManage, notifyEmail }: { csrf: string; requests: AccessRequestRow[]; invitable: Role[]; canManage: boolean; notifyEmail: string }) {
  const { run, pending, error } = useSubmit();
  const toast = useToast();
  const [rows, setRows] = useState(requests);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [link, setLink] = useState<string | null>(null);

  async function decide(row: AccessRequestRow, decision: "approve" | "decline") {
    const role = roles[row.id] ?? invitable[invitable.length - 1] ?? "viewer";
    const res = await run<{ decision: string; emailed?: boolean; url?: string }>(
      "/api/admin/users/access-request",
      decision === "approve" ? { id: row.id, decision, role } : { id: row.id, decision },
      csrf,
    );
    if (!res?.data.ok) {
      toast({ kind: "error", title: decision === "approve" ? "Not approved" : "Not declined", body: error ?? undefined });
      return;
    }
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, status: decision === "approve" ? "approved" : "declined" } : x)));
    if (decision === "decline") {
      toast({ kind: "success", title: `Request from ${row.email} declined`, body: "No email was sent." });
      return;
    }
    if (res.data.url && !res.data.emailed) setLink(res.data.url);
    toast({
      kind: "success",
      title: res.data.emailed ? `Invitation emailed to ${row.email}` : `Invitation created for ${row.email}`,
      body: res.data.emailed ? "It is valid for 72 hours." : "Email delivery is not configured, share the link shown.",
    });
  }

  async function notify(row: AccessRequestRow) {
    const res = await run<{ outcome: NoticeOutcome }>("/api/admin/users/access-request/notify", { id: row.id }, csrf);
    if (!res?.data.ok) {
      toast({ kind: "error", title: "Notification not sent", body: error ?? undefined });
      return;
    }
    const o = res.data.outcome;
    setRows((r) =>
      r.map((x) =>
        x.id === row.id
          ? { ...x, notifiedAt: o.status === "sent" ? "just now" : x.notifiedAt, notifyChannel: o.status === "sent" ? o.channel : x.notifyChannel, notifyError: o.status === "sent" ? null : o.error }
          : x,
      ),
    );
    if (o.status === "sent") toast({ kind: "success", title: `${notifyEmail} notified via ${o.channel}` });
    else toast({ kind: "error", title: `${notifyEmail} was not notified`, body: o.error ?? undefined });
  }

  if (rows.length === 0) {
    return <p className="adm-empty">No access requests. The form at /admin/request-access feeds this queue, and each new request emails {notifyEmail}.</p>;
  }

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}
      {link && <p className="adm-mono" style={{ wordBreak: "break-all" }}>{link}</p>}
      <div className="adm-table-wrap" tabIndex={0} style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <caption className="adm-sr">Access requests</caption>
          <thead>
            <tr>
              <th scope="col">Who</th>
              <th scope="col">Reason</th>
              <th scope="col">Requested</th>
              <th scope="col">Status</th>
              <th scope="col">Admin told</th>
              {canManage && <th scope="col"><span className="adm-sr">Decision</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Who">
                  <div><strong>{row.name}</strong></div>
                  <div className="adm-help" style={{ overflowWrap: "anywhere" }}>{row.email}</div>
                  {row.organisation && <div className="adm-help">{row.organisation}</div>}
                </td>
                <td data-label="Reason"><div style={{ maxInlineSize: 420, whiteSpace: "pre-wrap" }}>{row.reason}</div></td>
                <td data-label="Requested">{row.createdAt}</td>
                <td data-label="Status">
                  <Badge tone={TONE[row.status]}>{row.status}</Badge>
                  {row.status !== "pending" && row.decidedBy && <div className="adm-help">by {row.decidedBy}</div>}
                </td>
                <td data-label="Admin told">
                  {row.notifiedAt ? (
                    <>
                      <Badge tone="ok">yes</Badge>
                      <div className="adm-help">{row.notifiedAt} via {row.notifyChannel}</div>
                    </>
                  ) : (
                    <>
                      <Badge tone="danger">no</Badge>
                      {row.notifyError && <div className="adm-help" style={{ overflowWrap: "anywhere" }}>{row.notifyError}</div>}
                    </>
                  )}
                  {canManage && row.status === "pending" && (
                    <div className="adm-actions" style={{ marginBlockStart: 6 }}>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => notify(row)}>{row.notifiedAt ? "Notify again" : "Notify now"}</Button>
                    </div>
                  )}
                </td>
                {canManage && (
                  <td className="adm-td-actions">
                    {row.status === "pending" ? (
                      <div className="adm-actions">
                        <div className="adm-field">
                          <label className="adm-sr" htmlFor={`ar-role-${row.id}`}>Invite {row.email} as</label>
                          <select
                            id={`ar-role-${row.id}`}
                            className="adm-input adm-select"
                            value={roles[row.id] ?? invitable[invitable.length - 1] ?? "viewer"}
                            onChange={(e) => setRoles((r) => ({ ...r, [row.id]: e.target.value as Role }))}
                            disabled={pending}
                          >
                            {invitable.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <Button size="sm" disabled={pending} onClick={() => decide(row, "approve")}>Approve</Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(row, "decline")}>Decline</Button>
                      </div>
                    ) : (
                      <span className="adm-help">{row.decidedAt}</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
