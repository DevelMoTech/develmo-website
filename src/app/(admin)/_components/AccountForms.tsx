"use client";

import { useState } from "react";
import { useSubmit } from "./api-client";

function Alert({ kind, text }: { kind: "error" | "success"; text: string }) {
  return (
    <div className={`adm-alert adm-alert-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      <p>{text}</p>
    </div>
  );
}

export function ProfileForm({ csrf, name: initial }: { csrf: string; name: string }) {
  const { run, pending, error, issues } = useSubmit();
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const res = await run("/api/admin/account/profile", { name }, csrf);
    if (res?.data.ok) setSaved(true);
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="pf-name">Name</label>
        <input id="pf-name" className="adm-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} aria-invalid={issues.name ? "true" : undefined} />
        {issues.name && <p className="adm-error">{issues.name}</p>}
      </div>
      {error && <Alert kind="error" text={error} />}
      {saved && <Alert kind="success" text="Name saved." />}
      <div className="adm-actions">
        <button className="adm-btn adm-btn-primary adm-btn-sm" type="submit" disabled={pending}>Save name</button>
      </div>
    </form>
  );
}

export function ChangePasswordForm({ csrf, required }: { csrf: string; required: boolean }) {
  const { run, pending, error, issues, setError } = useSubmit();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    const res = await run<{ redirectTo: string | null }>("/api/admin/account/password", { currentPassword: current, newPassword: next }, csrf);
    if (res?.data.ok) {
      if (res.data.redirectTo) {
        window.location.assign(res.data.redirectTo);
        return;
      }
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      if (required) window.location.assign("/admin/account");
    }
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <div className="adm-field">
        <label className="adm-label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" className="adm-input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="pw-next">New password</label>
        <input id="pw-next" className="adm-input" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={issues.newPassword ? "true" : undefined} aria-describedby="pw-next-help" />
        <p id="pw-next-help" className={issues.newPassword ? "adm-error" : "adm-help"}>{issues.newPassword ?? "At least 12 characters. Other sessions will be signed out."}</p>
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" className="adm-input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <Alert kind="error" text={error} />}
      {saved && <Alert kind="success" text="Password changed." />}
      <div className="adm-actions">
        <button className="adm-btn adm-btn-primary adm-btn-sm" type="submit" disabled={pending}>Change password</button>
      </div>
    </form>
  );
}

export function ChangeEmailForm({ csrf, email }: { csrf: string; email: string }) {
  const { run, pending, error, issues } = useSubmit();
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
    }
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <p className="adm-help">Current address: {email}. Changing it needs your password and a confirmation link sent to the new address.</p>
      <div className="adm-field">
        <label className="adm-label" htmlFor="em-new">New email</label>
        <input id="em-new" className="adm-input" type="email" autoComplete="off" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} aria-invalid={issues.newEmail ? "true" : undefined} />
        {issues.newEmail && <p className="adm-error">{issues.newEmail}</p>}
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="em-password">Current password</label>
        <input id="em-password" className="adm-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <Alert kind="error" text={error} />}
      {sent && <Alert kind="success" text="If that address can be used, a confirmation link has been sent to it. It is valid for 60 minutes." />}
      <div className="adm-actions">
        <button className="adm-btn adm-btn-ghost adm-btn-sm" type="submit" disabled={pending}>Send confirmation link</button>
      </div>
    </form>
  );
}

export function MfaResetForm({ csrf }: { csrf: string }) {
  const { run, pending, error } = useSubmit();
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await run<{ redirectTo: string | null }>("/api/admin/account/mfa/reset", { currentPassword: password }, csrf);
    if (res?.data.ok) window.location.assign(res.data.redirectTo || "/admin/account");
  }
  if (!open) {
    return (
      <div className="adm-actions">
        <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" onClick={() => setOpen(true)}>Reset authenticator</button>
      </div>
    );
  }
  return (
    <form className="adm-form" onSubmit={onSubmit} noValidate>
      <p className="adm-help">This removes your current authenticator and recovery codes. Confirm with your password. If your role requires two-factor authentication you will set it up again straight away.</p>
      <div className="adm-field">
        <label className="adm-label" htmlFor="mfa-reset-pw">Current password</label>
        <input id="mfa-reset-pw" className="adm-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <Alert kind="error" text={error} />}
      <div className="adm-actions">
        <button className="adm-btn adm-btn-danger adm-btn-sm" type="submit" disabled={pending}>Confirm reset</button>
        <button className="adm-btn adm-btn-ghost adm-btn-sm" type="button" onClick={() => setOpen(false)}>Cancel</button>
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
  const [rows, setRows] = useState(sessions);
  const [notice, setNotice] = useState<string | null>(null);

  async function revoke(id: string) {
    const before = rows;
    setRows((r) => r.filter((s) => s.id !== id));
    const res = await run<{ redirectTo: string | null }>("/api/admin/sessions/revoke", { sessionId: id }, csrf);
    if (!res?.data.ok) setRows(before);
    else if (res.data.redirectTo) window.location.assign(res.data.redirectTo);
    else setNotice("Session revoked. It stops working on its next request.");
  }

  async function revokeOthers() {
    const before = rows;
    setRows((r) => r.filter((s) => s.current));
    const res = await run<{ revoked: number }>("/api/admin/sessions/revoke-others", {}, csrf);
    if (!res?.data.ok) setRows(before);
    else setNotice(`${res.data.revoked} other session${res.data.revoked === 1 ? "" : "s"} revoked.`);
  }

  return (
    <div>
      {error && <Alert kind="error" text={error} />}
      {notice && <Alert kind="success" text={notice} />}
      <div className="adm-table-wrap" style={{ marginBlockStart: 14 }}>
        <table className="adm-table">
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
                  <div>{s.device} {s.current && <span className="adm-badge adm-badge-ok">This device</span>}</div>
                  <div className="adm-help adm-mono" title={s.userAgent}>{s.userAgent.slice(0, 80)}{s.userAgent.length > 80 ? "…" : ""}</div>
                </td>
                <td data-label="IP hash" className="adm-mono">{s.ipHash ? s.ipHash.slice(0, 12) : "n/a"}</td>
                <td data-label="Last seen">{s.lastSeenAt}</td>
                <td data-label="Signed in">{s.createdAt}</td>
                <td className="adm-td-actions">
                  <div className="adm-actions">
                    <button type="button" className="adm-btn adm-btn-danger adm-btn-sm" disabled={pending} onClick={() => revoke(s.id)}>
                      {s.current ? "Sign out" : "Revoke"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1 && (
        <div className="adm-actions" style={{ marginBlockStart: 12 }}>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={pending} onClick={revokeOthers}>Revoke all other sessions</button>
        </div>
      )}
    </div>
  );
}
