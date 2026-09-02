"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";
import type { Role } from "@/lib/auth/rbac";

function Alert({ kind, text }: { kind: "error" | "success" | "info"; text: string }) {
  return (
    <div className={`adm-alert adm-alert-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <p>{text}</p>
    </div>
  );
}

export function InviteForm({ csrf, roles }: { csrf: string; roles: Role[] }) {
  const { run, pending, error, issues } = useSubmit();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(roles.includes("editor") ? "editor" : roles[0]);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const res = await run<{ url: string; emailed: boolean }>("/api/admin/users/invite", { email, role }, csrf);
    if (res?.data.ok) {
      setResult({ url: res.data.url, emailed: res.data.emailed });
      setEmail("");
    }
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="inv-email">Email</label>
        <input id="inv-email" className="adm-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={issues.email ? "true" : undefined} />
        {issues.email && <p className="adm-error">{issues.email}</p>}
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="inv-role">Role</label>
        <select id="inv-role" className="adm-input adm-select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      {error && <Alert kind="error" text={error} />}
      {result && (
        <div className="adm-alert adm-alert-success" role="status">
          <p>{result.emailed ? "Invitation emailed. " : "Email delivery is not configured, so share this link yourself. "}The link works once and expires in 72 hours.</p>
          <p className="adm-mono" style={{ marginBlockStart: 8, wordBreak: "break-all" }}>{result.url}</p>
        </div>
      )}
      <div className="adm-actions">
        <button className="adm-btn adm-btn-primary adm-btn-sm" type="submit" disabled={pending}>Send invitation</button>
      </div>
    </form>
  );
}

export type UserView = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "locked" | "deactivated";
  totpEnabled: boolean;
  lastLoginAt: string;
  self: boolean;
};

export function UsersTable({ csrf, users, canManage, actorRole }: { csrf: string; users: UserView[]; canManage: boolean; actorRole: Role }) {
  const { run, pending, error } = useSubmit();
  const [rows, setRows] = useState(users);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; email: string; typed: string } | null>(null);

  async function changeRole(u: UserView, role: Role) {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, role } : x)));
    const res = await run("/api/admin/users/role", { userId: u.id, role }, csrf);
    if (!res?.data.ok) setRows(before);
    else setNotice(`${u.email} is now ${role}. Their sessions were signed out.`);
  }

  async function setStatus(u: UserView, status: "active" | "deactivated") {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, status } : x)));
    const res = await run("/api/admin/users/status", { userId: u.id, status }, csrf);
    if (!res?.data.ok) setRows(before);
    else setNotice(status === "active" ? `${u.email} reactivated.` : `${u.email} deactivated and signed out everywhere.`);
  }

  async function remove() {
    if (!confirmDelete) return;
    const res = await run("/api/admin/users/delete", { userId: confirmDelete.id, confirm: confirmDelete.typed }, csrf);
    if (res?.data.ok) {
      setRows((r) => r.filter((x) => x.id !== confirmDelete.id));
      setNotice(`${confirmDelete.email} deleted.`);
      setConfirmDelete(null);
    }
  }

  const roleOptions: Role[] = actorRole === "owner" ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];

  return (
    <div>
      {error && <Alert kind="error" text={error} />}
      {notice && <Alert kind="success" text={notice} />}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">MFA</th>
              <th scope="col">Last login</th>
              {canManage && <th scope="col"><span className="adm-sr">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isOwner = u.role === "owner";
              const roleLocked = !canManage || (isOwner && !u.self) || (actorRole !== "owner" && isOwner);
              return (
                <tr key={u.id}>
                  <td data-label="User">
                    <div>{u.name} {u.self && <span className="adm-badge adm-badge-ok">You</span>}</div>
                    <div className="adm-help">{u.email}</div>
                  </td>
                  <td data-label="Role">
                    {roleLocked ? (
                      <span className="adm-badge">{u.role}</span>
                    ) : (
                      <>
                        <label className="adm-sr" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                        <select id={`role-${u.id}`} className="adm-input adm-select" value={u.role} disabled={pending} onChange={(e) => changeRole(u, e.target.value as Role)} style={{ minInlineSize: 120 }}>
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className={`adm-badge ${u.status === "active" ? "adm-badge-ok" : "adm-badge-danger"}`}>{u.status}</span>
                  </td>
                  <td data-label="MFA">{u.totpEnabled ? "On" : "Off"}</td>
                  <td data-label="Last login">{u.lastLoginAt}</td>
                  {canManage && (
                    <td className="adm-td-actions">
                      {!u.self && !(isOwner && actorRole !== "owner") && (
                        <div className="adm-actions">
                          {u.status === "active" ? (
                            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={pending || isOwner} onClick={() => setStatus(u, "deactivated")}>Deactivate</button>
                          ) : (
                            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={pending} onClick={() => setStatus(u, "active")}>Reactivate</button>
                          )}
                          <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" disabled={pending || isOwner} onClick={() => setConfirmDelete({ id: u.id, email: u.email, typed: "" })}>Delete</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirmDelete && (
        <div className="adm-alert adm-alert-error" role="alertdialog" aria-labelledby="del-title" style={{ marginBlockStart: 14 }}>
          <p id="del-title"><strong>Delete {confirmDelete.email}?</strong> This cannot be undone. Their audit history is kept. Type the email address to confirm.</p>
          <div className="adm-field" style={{ marginBlockStart: 10 }}>
            <label className="adm-label" htmlFor="del-confirm">Email address</label>
            <input id="del-confirm" className="adm-input" value={confirmDelete.typed} onChange={(e) => setConfirmDelete({ ...confirmDelete, typed: e.target.value })} autoComplete="off" />
          </div>
          <div className="adm-actions" style={{ marginBlockStart: 10 }}>
            <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" disabled={pending || confirmDelete.typed.trim().toLowerCase() !== confirmDelete.email} onClick={remove}>Delete user</button>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export type InviteView = { id: string; email: string; role: Role; expiresAt: string };

export function InvitesTable({ csrf, invites }: { csrf: string; invites: InviteView[] }) {
  const { run, pending, error } = useSubmit();
  const [rows, setRows] = useState(invites);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function revoke(inv: InviteView) {
    const before = rows;
    setRows((r) => r.filter((x) => x.id !== inv.id));
    const res = await run("/api/admin/users/invite/revoke", { inviteId: inv.id }, csrf);
    if (!res?.data.ok) setRows(before);
    else setNotice(`Invitation for ${inv.email} revoked.`);
  }

  async function resend(inv: InviteView) {
    const res = await run<{ url: string; emailed: boolean }>("/api/admin/users/invite/resend", { inviteId: inv.id }, csrf);
    if (res?.data.ok) {
      setNotice(res.data.emailed ? `New invitation emailed to ${inv.email}.` : `New invitation created for ${inv.email}. Email delivery is not configured, share the link below.`);
      setLink(res.data.url);
      window.location.reload();
    }
  }

  if (rows.length === 0) return <p className="adm-empty">No open invitations.</p>;

  return (
    <div>
      {error && <Alert kind="error" text={error} />}
      {notice && <Alert kind="success" text={notice} />}
      {link && <p className="adm-mono" style={{ wordBreak: "break-all" }}>{link}</p>}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Expires</th>
              <th scope="col"><span className="adm-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id}>
                <td data-label="Email">{inv.email}</td>
                <td data-label="Role"><span className="adm-badge">{inv.role}</span></td>
                <td data-label="Expires">{inv.expiresAt}</td>
                <td className="adm-td-actions">
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={pending} onClick={() => resend(inv)}>Resend</button>
                    <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" disabled={pending} onClick={() => revoke(inv)}>Revoke</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
