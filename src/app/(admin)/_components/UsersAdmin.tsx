"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";
import { Alert, Badge } from "./ui/Basics";
import { Button } from "./ui/Button";
import { Input, Select } from "./ui/Field";
import { ConfirmDialog } from "./ui/Modal";
import { useToast } from "./ui/Toast";
import type { Role } from "@/lib/auth/rbac";

export function InviteForm({ csrf, roles }: { csrf: string; roles: Role[] }) {
  const { run, pending, error, issues } = useSubmit();
  const toast = useToast();
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
      toast({ kind: "success", title: "Invitation created", body: res.data.emailed ? `Emailed to ${email}.` : "Email delivery is not configured. Share the link below." });
    } else if (res) {
      toast({ kind: "error", title: "Invitation not sent", body: error ?? undefined });
    }
  }

  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <Input id="inv-email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={issues.email} />
      <Select id="inv-role" label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={roles.map((r) => ({ value: r, label: r }))} />
      {error && <Alert kind="error">{error}</Alert>}
      {result && (
        <Alert kind="success">
          <p>{result.emailed ? "Invitation emailed. " : "Email delivery is not configured, so share this link yourself. "}The link works once and expires in 72 hours.</p>
          <p className="adm-mono" style={{ marginBlockStart: 8, wordBreak: "break-all" }}>{result.url}</p>
        </Alert>
      )}
      <div className="adm-actions">
        <Button type="submit" size="sm" disabled={pending}>Send invitation</Button>
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
  const toast = useToast();
  const [rows, setRows] = useState(users);
  const [confirmDelete, setConfirmDelete] = useState<UserView | null>(null);

  async function changeRole(u: UserView, role: Role) {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, role } : x)));
    const res = await run("/api/admin/users/role", { userId: u.id, role }, csrf);
    if (!res?.data.ok) {
      setRows(before);
      toast({ kind: "error", title: "Role not changed", body: error ?? undefined });
    } else toast({ kind: "success", title: `${u.email} is now ${role}`, body: "Their sessions were signed out." });
  }

  async function setStatus(u: UserView, status: "active" | "deactivated") {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === u.id ? { ...x, status } : x)));
    const res = await run("/api/admin/users/status", { userId: u.id, status }, csrf);
    if (!res?.data.ok) {
      setRows(before);
      toast({ kind: "error", title: "Status not changed", body: error ?? undefined });
    } else toast({ kind: "success", title: status === "active" ? `${u.email} reactivated` : `${u.email} deactivated`, body: status === "active" ? undefined : "Signed out everywhere." });
  }

  async function remove() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    const res = await run("/api/admin/users/delete", { userId: target.id, confirm: target.email }, csrf);
    if (res?.data.ok) {
      setRows((r) => r.filter((x) => x.id !== target.id));
      setConfirmDelete(null);
      toast({ kind: "success", title: `${target.email} deleted`, body: "Their audit history is kept." });
    } else {
      toast({ kind: "error", title: "User not deleted", body: error ?? undefined });
    }
  }

  const roleOptions: Role[] = actorRole === "owner" ? ["owner", "admin", "editor", "viewer"] : ["admin", "editor", "viewer"];

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <caption className="adm-sr">Staff accounts</caption>
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
                    <div>{u.name} {u.self && <Badge tone="ok">You</Badge>}</div>
                    <div className="adm-help">{u.email}</div>
                  </td>
                  <td data-label="Role">
                    {roleLocked ? (
                      <Badge>{u.role}</Badge>
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
                  <td data-label="Status"><Badge tone={u.status === "active" ? "ok" : "danger"}>{u.status}</Badge></td>
                  <td data-label="MFA">{u.totpEnabled ? "On" : "Off"}</td>
                  <td data-label="Last login">{u.lastLoginAt}</td>
                  {canManage && (
                    <td className="adm-td-actions">
                      {!u.self && !(isOwner && actorRole !== "owner") && (
                        <div className="adm-actions">
                          {u.status === "active" ? (
                            <Button variant="ghost" size="sm" disabled={pending || isOwner} onClick={() => setStatus(u, "deactivated")}>Deactivate</Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStatus(u, "active")}>Reactivate</Button>
                          )}
                          <Button variant="danger" size="sm" disabled={pending || isOwner} onClick={() => setConfirmDelete(u)}>Delete</Button>
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
      <ConfirmDialog
        key={confirmDelete?.id ?? "none"}
        id="delete-user"
        open={confirmDelete !== null}
        title={confirmDelete ? `Delete ${confirmDelete.email}?` : "Delete user"}
        body="This cannot be undone. Their audit history is kept. Type the email address to confirm."
        confirmLabel="Delete user"
        typed={confirmDelete?.email}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

export type InviteView = { id: string; email: string; role: Role; expiresAt: string };

export function InvitesTable({ csrf, invites }: { csrf: string; invites: InviteView[] }) {
  const { run, pending, error } = useSubmit();
  const toast = useToast();
  const [rows, setRows] = useState(invites);
  const [link, setLink] = useState<string | null>(null);

  async function revoke(inv: InviteView) {
    const before = rows;
    setRows((r) => r.filter((x) => x.id !== inv.id));
    const res = await run("/api/admin/users/invite/revoke", { inviteId: inv.id }, csrf);
    if (!res?.data.ok) {
      setRows(before);
      toast({ kind: "error", title: "Invitation not revoked", body: error ?? undefined });
    } else toast({ kind: "success", title: `Invitation for ${inv.email} revoked` });
  }

  async function resend(inv: InviteView) {
    const res = await run<{ url: string; emailed: boolean }>("/api/admin/users/invite/resend", { inviteId: inv.id }, csrf);
    if (res?.data.ok) {
      toast({ kind: "success", title: res.data.emailed ? `New invitation emailed to ${inv.email}` : `New invitation created for ${inv.email}`, body: res.data.emailed ? undefined : "Email delivery is not configured, share the link shown." });
      setLink(res.data.url);
      window.location.reload();
    } else toast({ kind: "error", title: "Invitation not resent", body: error ?? undefined });
  }

  if (rows.length === 0) return <p className="adm-empty">No open invitations.</p>;

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}
      {link && <p className="adm-mono" style={{ wordBreak: "break-all" }}>{link}</p>}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <caption className="adm-sr">Open invitations</caption>
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
                <td data-label="Role"><Badge>{inv.role}</Badge></td>
                <td data-label="Expires">{inv.expiresAt}</td>
                <td className="adm-td-actions">
                  <div className="adm-actions">
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => resend(inv)}>Resend</Button>
                    <Button variant="danger" size="sm" disabled={pending} onClick={() => revoke(inv)}>Revoke</Button>
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
