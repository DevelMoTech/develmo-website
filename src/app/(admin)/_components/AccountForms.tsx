"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";
import { Alert, Badge } from "./ui/Basics";
import { Button } from "./ui/Button";
import { Input } from "./ui/Field";
import { useToast } from "./ui/Toast";
import { useUnsavedChanges } from "../_lib/useUnsavedChanges";

export function ProfileForm({ csrf, name: initial }: { csrf: string; name: string }) {
  const { run, pending, error, issues } = useSubmit();
  const toast = useToast();
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  useUnsavedChanges(name !== saved);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run("/api/admin/account/profile", { name }, csrf);
    if (res?.data.ok) {
      setSaved(name);
      toast({ kind: "success", title: "Name saved" });
    } else if (res) toast({ kind: "error", title: "Name not saved", body: error ?? undefined });
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <Input id="pf-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} error={issues.name} help="How your name appears in the audit log and to other staff." />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="adm-actions">
        <Button type="submit" size="sm" disabled={pending || name === saved}>Save name</Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm({ csrf, required }: { csrf: string; required: boolean }) {
  const { run, pending, error, issues, setError } = useSubmit();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    const res = await run<{ redirectTo: string | null }>("/api/admin/account/password", { currentPassword: current, newPassword: next }, csrf);
    if (res?.data.ok) {
      toast({ kind: "success", title: "Password changed", body: "Other sessions were signed out." });
      if (res.data.redirectTo) {
        window.location.assign(res.data.redirectTo);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      if (required) window.location.assign("/admin/account");
    } else if (res) toast({ kind: "error", title: "Password not changed", body: error ?? undefined });
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <Input id="pw-current" label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Input id="pw-next" label="New password" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} error={issues.newPassword} help="At least 12 characters. Other sessions will be signed out." />
      <Input id="pw-confirm" label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="adm-actions">
        <Button type="submit" size="sm" disabled={pending}>Change password</Button>
      </div>
    </form>
  );
}

export function ChangeEmailForm({ csrf, email }: { csrf: string; email: string }) {
  const { run, pending, error, issues } = useSubmit();
  const toast = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(false);
    const res = await run("/api/admin/account/email", { newEmail, currentPassword: password }, csrf);
    if (res?.data.ok) {
      setSent(true);
      setPassword("");
      toast({ kind: "success", title: "Confirmation link sent", body: "If the address can be used, the link is valid for 60 minutes." });
    } else if (res) toast({ kind: "error", title: "Email change not requested", body: error ?? undefined });
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <p className="adm-help">Current address: {email}. Changing it needs your password and a confirmation link sent to the new address.</p>
      <Input id="em-new" label="New email" type="email" autoComplete="off" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} error={issues.newEmail} />
      <Input id="em-password" label="Current password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert kind="error">{error}</Alert>}
      {sent && <Alert kind="success">If that address can be used, a confirmation link has been sent to it. It is valid for 60 minutes.</Alert>}
      <div className="adm-actions">
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>Send confirmation link</Button>
      </div>
    </form>
  );
}

export function MfaResetForm({ csrf }: { csrf: string }) {
  const { run, pending, error } = useSubmit();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ redirectTo: string | null }>("/api/admin/account/mfa/reset", { currentPassword: password }, csrf);
    if (res?.data.ok) {
      toast({ kind: "success", title: "Authenticator removed" });
      window.location.assign(res.data.redirectTo || "/admin/account");
    } else if (res) toast({ kind: "error", title: "Authenticator not reset", body: error ?? undefined });
  }
  if (!open) {
    return (
      <div className="adm-actions">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Reset authenticator</Button>
      </div>
    );
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <p className="adm-help">This removes your current authenticator and recovery codes. Confirm with your password. If your role requires two-factor authentication you will set it up again straight away.</p>
      <Input id="mfa-reset-pw" label="Current password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="adm-actions">
        <Button variant="danger" size="sm" type="submit" disabled={pending}>Confirm reset</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export type SessionView = {
  id: string;
  current: boolean;
  device: string;
  userAgent: string;
  ipHash: string;
  lastSeenAt: string;
  createdAt: string;
};

export function SessionsList({ csrf, sessions }: { csrf: string; sessions: SessionView[] }) {
  const { run, pending, error } = useSubmit();
  const toast = useToast();
  const [rows, setRows] = useState(sessions);

  async function revoke(id: string) {
    const before = rows;
    setRows((r) => r.filter((s) => s.id !== id));
    const res = await run<{ redirectTo: string | null }>("/api/admin/sessions/revoke", { sessionId: id }, csrf);
    if (!res?.data.ok) {
      setRows(before);
      toast({ kind: "error", title: "Session not revoked", body: error ?? undefined });
    } else if (res.data.redirectTo) window.location.assign(res.data.redirectTo);
    else toast({ kind: "success", title: "Session revoked", body: "It stops working on its next request." });
  }

  async function revokeOthers() {
    const before = rows;
    setRows((r) => r.filter((s) => s.current));
    const res = await run<{ revoked: number }>("/api/admin/sessions/revoke-others", {}, csrf);
    if (!res?.data.ok) {
      setRows(before);
      toast({ kind: "error", title: "Sessions not revoked", body: error ?? undefined });
    } else toast({ kind: "success", title: `${res.data.revoked} other session${res.data.revoked === 1 ? "" : "s"} revoked` });
  }

  return (
    <div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
          <caption className="adm-sr">Active sessions</caption>
          <thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">IP hash</th>
              <th scope="col">Last seen</th>
              <th scope="col">Signed in</th>
              <th scope="col"><span className="adm-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td data-label="Device">
                  <div>{s.device} {s.current && <Badge tone="ok">This device</Badge>}</div>
                  <div className="adm-help adm-mono" title={s.userAgent}>{s.userAgent.slice(0, 80)}{s.userAgent.length > 80 ? "…" : ""}</div>
                </td>
                <td data-label="IP hash" className="adm-mono">{s.ipHash ? s.ipHash.slice(0, 12) : "n/a"}</td>
                <td data-label="Last seen">{s.lastSeenAt}</td>
                <td data-label="Signed in">{s.createdAt}</td>
                <td className="adm-td-actions">
                  <div className="adm-actions">
                    <Button variant="danger" size="sm" disabled={pending} onClick={() => revoke(s.id)}>{s.current ? "Sign out" : "Revoke"}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1 && (
        <div className="adm-actions" style={{ marginBlockStart: 12 }}>
          <Button variant="ghost" size="sm" disabled={pending} onClick={revokeOthers}>Revoke all other sessions</Button>
        </div>
      )}
    </div>
  );
}
